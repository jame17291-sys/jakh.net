import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentReviewReport,
  mutableLanguageMatches,
  reviewValidationErrors,
} from "./content-review-lib.mjs";

function card(overrides = {}) {
  return {
    id: "example-1",
    question: { en: "What is the answer?", ar: "ما الإجابة؟" },
    answer: { en: "Example", ar: "مثال" },
    review: { status: "pending" },
    ...overrides,
  };
}

test("ordinary pending cards use the compact review contract", () => {
  assert.deepEqual(reviewValidationErrors({ status: "pending" }, "history"), []);
});

test("pending high-stakes cards are visibly flagged and high priority", () => {
  assert.deepEqual(
    reviewValidationErrors(
      { status: "pending", safetySensitive: true, priority: "high" },
      "medical-questions",
    ),
    [],
  );
  assert.match(
    reviewValidationErrors({ status: "pending" }, "medical-questions").join("\n"),
    /safetySensitive/u,
  );
  assert.match(
    reviewValidationErrors({ status: "pending" }, "medical-questions").join("\n"),
    /priority/u,
  );
});

test("reviewed cards require dated, attributed HTTPS sources", () => {
  const valid = {
    status: "reviewed",
    reviewedAt: "2026-08-01",
    reviewer: "JAKH editorial review",
    sources: [{
      title: "Official source",
      publisher: "Public institution",
      url: "https://example.gov/reference",
    }],
  };
  assert.deepEqual(reviewValidationErrors(valid, "history"), []);
  assert.match(
    reviewValidationErrors({ ...valid, sources: [] }, "history").join("\n"),
    /at least one authoritative/u,
  );
  assert.match(
    reviewValidationErrors({ ...valid, sources: [{
      title: "Insecure source",
      publisher: "Public institution",
      url: "http://example.gov/reference",
    }] }, "history").join("\n"),
    /HTTPS/u,
  );
});

test("mutable-language matching returns candidate reasons, not a truth verdict", () => {
  assert.deepEqual(
    mutableLanguageMatches(card({
      question: {
        en: "Who is the current all-time record goalscorer?",
        ar: "من هو الهداف التاريخي الحالي؟",
      },
    })),
    ["current-state", "record-or-ranking"],
  );
  assert.deepEqual(mutableLanguageMatches(card()), []);
});

test("report separates reviewed, pending, high-stakes, mutable, and stale cards", () => {
  const report = buildContentReviewReport([
    {
      category: "history",
      card: card({
        id: "history-1",
        question: { en: "Who is the current record holder?", ar: "من هو صاحب الرقم القياسي الحالي؟" },
        review: {
          status: "reviewed",
          reviewedAt: "2024-01-01",
          reviewer: "JAKH editorial review",
          sources: [{
            title: "Official source",
            publisher: "Public institution",
            url: "https://example.gov/reference",
          }],
        },
      }),
    },
    {
      category: "pharmacy",
      card: card({
        id: "pharmacy-1",
        review: { status: "pending", safetySensitive: true, priority: "high" },
      }),
    },
  ], { asOf: "2026-08-01" });

  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.reviewed, 1);
  assert.equal(report.summary.pending, 1);
  assert.equal(report.summary.highStakes.total, 1);
  assert.equal(report.summary.highStakes.pending, 1);
  assert.equal(report.summary.mutableLanguageCandidates, 1);
  assert.equal(report.summary.staleReviewed, 1);
  assert.equal(report.summary.validationErrors, 0);
  assert.equal(report.reviewedCards[0].id, "history-1");
  assert.equal(report.highStakesCards[0].id, "pharmacy-1");
  assert.equal(report.staleReviewedCards[0].id, "history-1");
});
