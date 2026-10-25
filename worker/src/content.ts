import { formerCategoriesOf, getCardIndex, wasCardCategory } from "./catalog.js";
import { isQuarantinedCategory } from "./content-safety.js";
import { ApiError, json } from "./http.js";
import type { Env } from "./types.js";

const CATEGORY_PATTERN = /^[a-z0-9-]{2,64}$/u;

interface PublishedContentRow {
  questionId: string;
  categorySlug?: string;
  publishedVersion: number;
  snapshotJson: string;
  publishedAt: string;
}

// Published Content Studio rows keep the topic they were saved under. A card
// moved by a recorded topic merge keeps its id, so its published edit follows
// it to its current topic and no longer applies to the topic it left.
async function publishedRows(env: Env, category: string): Promise<PublishedContentRow[]> {
  const categories = [category, ...formerCategoriesOf(category)];
  const rows = await env.DB.prepare(
    `SELECT question_id AS questionId, category_slug AS categorySlug, published_version AS publishedVersion,
            published_snapshot_json AS snapshotJson, published_at AS publishedAt
       FROM content_question_edits
      WHERE category_slug IN (${categories.map(() => "?").join(", ")}) AND published_snapshot_json IS NOT NULL
      ORDER BY question_id ASC`,
  ).bind(...categories).all<PublishedContentRow>();
  const index = getCardIndex(env);
  return rows.results.filter((row) => {
    const current = index[row.questionId]?.[0];
    if (!current) return row.categorySlug === category;
    return current === category
      && (row.categorySlug === category || wasCardCategory(row.questionId, row.categorySlug));
  });
}

function sameBilingualText(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const previous = left as { en?: unknown; ar?: unknown };
  const next = right as { en?: unknown; ar?: unknown };
  return previous.en === next.en && previous.ar === next.ar;
}

async function contentStudioIsReady(env: Env): Promise<boolean> {
  try {
    const schema = await env.DB.prepare(
      "SELECT value FROM schema_meta WHERE key = 'schema_version'",
    ).first<{ value: string }>();
    return Number(schema?.value || 0) >= 9;
  } catch {
    return false;
  }
}

export async function applyPublishedContentOverrides<T extends {
  id?: unknown;
  question?: unknown;
  answer?: unknown;
  explanation?: unknown;
  quickFire?: unknown;
  acceptedAnswers?: unknown;
}>(env: Env, category: string, cards: T[]): Promise<T[]> {
  if (!await contentStudioIsReady(env)) return cards;
  const rows = await publishedRows(env, category);
  const overrides = new Map(rows.flatMap((row) => {
    try {
      return [[row.questionId, JSON.parse(row.snapshotJson) as Record<string, unknown>] as const];
    } catch {
      return [];
    }
  }));
  if (!overrides.size) return cards;
  return cards.map((card) => {
    if (typeof card.id !== "string") return card;
    const override = overrides.get(card.id);
    if (!override) return card;
    const effective = {
      ...card,
      question: override.question ?? card.question,
      answer: override.answer ?? card.answer,
      explanation: override.explanation,
    } as T;
    const promptOrAnswerChanged = !sameBilingualText(card.question, effective.question)
      || !sameBilingualText(card.answer, effective.answer);
    // Static answer aliases are also tied to their original prompt and answer.
    // Studio snapshots cannot approve replacement aliases yet; keep scoring
    // bound to the newly published canonical answer instead of stale aliases.
    if (promptOrAnswerChanged) delete effective.acceptedAnswers;
    // Choices were authored for the static wording. Content Studio does not yet
    // publish a reviewed choice set, so never reuse it with a changed prompt,
    // answer, or explanation (even when the old answer still happens to match).
    if (
      promptOrAnswerChanged
      || !sameBilingualText(card.explanation, effective.explanation)
    ) delete effective.quickFire;
    return effective;
  });
}

export async function publishedContent(request: Request, env: Env): Promise<Response> {
  const category = (new URL(request.url).searchParams.get("category") || "").trim();
  if (!CATEGORY_PATTERN.test(category)) {
    throw new ApiError(400, "Invalid content category", undefined, "CONTENT_CATEGORY_INVALID");
  }
  if (isQuarantinedCategory(category)) {
    throw new ApiError(410, "Category is unavailable", undefined, "CATEGORY_UNAVAILABLE");
  }
  if (!await contentStudioIsReady(env)) {
    return json({ category, overrides: [], schemaReady: false });
  }
  const rows = await publishedRows(env, category);
  return json({
    category,
    schemaReady: true,
    overrides: rows.flatMap((row) => {
      try {
        const snapshot = JSON.parse(row.snapshotJson) as Record<string, unknown>;
        return [{
          id: row.questionId,
          version: row.publishedVersion,
          publishedAt: row.publishedAt,
          ...snapshot,
        }];
      } catch {
        return [];
      }
    }),
  }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
}
