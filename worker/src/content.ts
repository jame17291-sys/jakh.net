import { isQuarantinedCategory } from "./content-safety.js";
import { ApiError, json } from "./http.js";
import type { Env } from "./types.js";

const CATEGORY_PATTERN = /^[a-z0-9-]{2,64}$/u;

interface PublishedContentRow {
  questionId: string;
  publishedVersion: number;
  snapshotJson: string;
  publishedAt: string;
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
}>(env: Env, category: string, cards: T[]): Promise<T[]> {
  if (!await contentStudioIsReady(env)) return cards;
  const rows = await env.DB.prepare(
    `SELECT question_id AS questionId, published_version AS publishedVersion,
            published_snapshot_json AS snapshotJson, published_at AS publishedAt
       FROM content_question_edits
      WHERE category_slug = ? AND published_snapshot_json IS NOT NULL`,
  ).bind(category).all<PublishedContentRow>();
  const overrides = new Map(rows.results.flatMap((row) => {
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
    return {
      ...card,
      question: override.question ?? card.question,
      answer: override.answer ?? card.answer,
      explanation: override.explanation,
    } as T;
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
  const rows = await env.DB.prepare(
    `SELECT question_id AS questionId, published_version AS publishedVersion,
            published_snapshot_json AS snapshotJson, published_at AS publishedAt
       FROM content_question_edits
      WHERE category_slug = ? AND published_snapshot_json IS NOT NULL
      ORDER BY question_id ASC`,
  ).bind(category).all<PublishedContentRow>();
  return json({
    category,
    schemaReady: true,
    overrides: rows.results.flatMap((row) => {
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
