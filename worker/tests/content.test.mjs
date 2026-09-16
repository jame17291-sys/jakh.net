import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPublishedContentOverrides,
  publishedContent,
} from "../dist/content.js";
import { QUARANTINED_CATEGORY_IDS } from "../dist/content-safety.js";

function contentEnv(schema, rows = []) {
  return {
    DB: {
      prepare(sql) {
        if (sql.includes("schema_meta")) {
          return { async first() { return { value: schema }; } };
        }
        assert.match(sql, /content_question_edits/u);
        return {
          bind(category) {
            assert.equal(category, "science");
            return { async all() { return { results: rows }; } };
          },
        };
      },
    },
  };
}

const publishedRow = {
  questionId: "science-003",
  publishedVersion: 2,
  snapshotJson: JSON.stringify({
    question: { en: "What change turns a gas into a liquid?", ar: "ما اسم تحوّل الغاز إلى سائل؟" },
    answer: { en: "Condensation", ar: "التكاثف" },
    explanation: { en: "Cooling a gas can condense it.", ar: "عندما يبرد الغاز قد يتكاثف ويتحوّل إلى سائل." },
  }),
  publishedAt: "2026-08-03T00:00:00.000Z",
};

test("schema 8 serves the static catalog while Content Studio is unavailable", async () => {
  const response = await publishedContent(
    new Request("https://api.jakh.net/api/content/questions?category=science"),
    contentEnv("8"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    category: "science",
    overrides: [],
    schemaReady: false,
  });
});

test("schema 9 exposes only published bilingual snapshots", async () => {
  const response = await publishedContent(
    new Request("https://api.jakh.net/api/content/questions?category=science"),
    contentEnv("9", [publishedRow, { ...publishedRow, questionId: "broken", snapshotJson: "{" }]),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
  assert.deepEqual(await response.json(), {
    category: "science",
    schemaReady: true,
    overrides: [{
      id: "science-003",
      version: 2,
      publishedAt: "2026-08-03T00:00:00.000Z",
      ...JSON.parse(publishedRow.snapshotJson),
    }],
  });
});

test("server scoring and battles receive the same published answer override", async () => {
  const cards = [{
    id: "science-003",
    question: { en: "Old question", ar: "سؤال قديم" },
    answer: { en: "Old answer", ar: "إجابة قديمة" },
  }];
  const overridden = await applyPublishedContentOverrides(contentEnv("9", [publishedRow]), "science", cards);
  assert.equal(overridden[0].answer.en, "Condensation");
  assert.equal(overridden[0].answer.ar, "التكاثف");
  assert.equal(overridden[0].explanation.ar, "عندما يبرد الغاز قد يتكاثف ويتحوّل إلى سائل.");
});

test("published wording, answer, or explanation changes invalidate authored choices", async () => {
  const snapshot = JSON.parse(publishedRow.snapshotJson);
  for (const field of ["question", "answer", "explanation"]) {
    for (const language of ["en", "ar"]) {
      const card = {
        id: "science-003",
        ...structuredClone(snapshot),
        quickFire: { answer: snapshot.answer, marker: "static authored set" },
      };
      card[field][language] = "Previously authored wording";
      const original = structuredClone(card);
      const [overridden] = await applyPublishedContentOverrides(contentEnv("9", [publishedRow]), "science", [card]);
      assert.equal(Object.hasOwn(overridden, "quickFire"), false, `${field}.${language}`);
      assert.deepEqual(overridden[field], snapshot[field]);
      assert.deepEqual(card, original, "Source cards must not be mutated");
    }
  }
});

test("identical published content preserves authored choices and unedited cards", async () => {
  const snapshot = JSON.parse(publishedRow.snapshotJson);
  const card = {
    id: "science-003",
    ...snapshot,
    quickFire: { answer: snapshot.answer, marker: "static authored set" },
  };
  const untouched = { ...card, id: "science-004" };
  const [overridden, unedited] = await applyPublishedContentOverrides(contentEnv("9", [publishedRow]), "science", [card, untouched]);
  assert.deepEqual(overridden.quickFire, card.quickFire);
  assert.equal(unedited, untouched);
  assert.equal((await applyPublishedContentOverrides(contentEnv("8"), "science", [card]))[0], card);
});

test("published prompt or answer changes invalidate old accepted aliases in either language", async () => {
  const snapshot = JSON.parse(publishedRow.snapshotJson);
  for (const field of ["question", "answer"]) {
    for (const language of ["en", "ar"]) {
      const card = {
        id: "science-003",
        ...structuredClone(snapshot),
        acceptedAnswers: { en: ["Old concise answer"], ar: ["إجابة قديمة مختصرة"] },
      };
      card[field][language] = "Old wording";
      const [overridden] = await applyPublishedContentOverrides(contentEnv("9", [publishedRow]), "science", [card]);
      assert.equal(Object.hasOwn(overridden, "acceptedAnswers"), false, `${field}.${language}`);
      assert.ok(card.acceptedAnswers.en, "Source aliases must not be mutated");
    }
  }
});

test("explanation-only publication preserves accepted answer aliases", async () => {
  const snapshot = JSON.parse(publishedRow.snapshotJson);
  const card = {
    id: "science-003",
    ...snapshot,
    explanation: { en: "Old explanation", ar: "شرح قديم" },
    acceptedAnswers: { en: ["Condensing"], ar: ["تكاثف"] },
  };
  const [overridden] = await applyPublishedContentOverrides(contentEnv("9", [publishedRow]), "science", [card]);
  assert.deepEqual(overridden.acceptedAnswers, card.acceptedAnswers);
  assert.deepEqual(overridden.explanation, snapshot.explanation);
});

test("omitting a previous explanation invalidates its authored choices", async () => {
  const snapshot = JSON.parse(publishedRow.snapshotJson);
  const card = { id: "science-003", ...snapshot, quickFire: { answer: snapshot.answer } };
  const { explanation: _explanation, ...withoutExplanation } = snapshot;
  const row = { ...publishedRow, snapshotJson: JSON.stringify(withoutExplanation) };
  const [overridden] = await applyPublishedContentOverrides(contentEnv("9", [row]), "science", [card]);
  assert.equal(overridden.quickFire, undefined);
});

test("public content overrides reject invalid and quarantined categories", async () => {
  await assert.rejects(
    () => publishedContent(new Request("https://api.jakh.net/api/content/questions?category=../science"), contentEnv("9")),
    (error) => error?.status === 400 && error?.code === "CONTENT_CATEGORY_INVALID",
  );
  const held = QUARANTINED_CATEGORY_IDS[0];
  await assert.rejects(
    () => publishedContent(new Request(`https://api.jakh.net/api/content/questions?category=${held}`), contentEnv("9")),
    (error) => error?.status === 410 && error?.code === "CATEGORY_UNAVAILABLE",
  );
});
