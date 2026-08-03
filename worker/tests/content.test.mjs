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
