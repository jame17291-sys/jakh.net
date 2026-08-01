import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildContentReviewWorkQueue,
  buildEvidenceCoverage,
  buildContentReviewReport,
  mutableLanguageMatches,
  reviewValidationErrors,
  validateEvidenceStore,
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

function reviewedCard(overrides = {}) {
  return card({
    review: {
      status: "reviewed",
      reviewedAt: "2026-08-01",
      reviewer: "JAKH editorial review",
      sources: [{
        title: "Official reference",
        publisher: "Public institution",
        url: "https://example.gov/reference",
      }],
    },
    ...overrides,
  });
}

function completeEvidenceStore(cardId = "example-1") {
  return {
    schemaVersion: 1,
    reviewers: {
      editor: {
        displayName: "Editorial reviewer",
        roles: ["editor", "fact-checker"],
        qualifications: [],
      },
      bilingual: {
        displayName: "Bilingual reviewer",
        roles: ["bilingual-reviewer"],
        qualifications: [],
      },
    },
    cards: {
      [cardId]: {
        claims: [{
          id: "claim-1",
          text: { en: "The answer is Example.", ar: "الإجابة هي مثال." },
          evidenceIds: ["source-1"],
        }],
        evidence: [{
          id: "source-1",
          type: "web",
          status: "accepted",
          title: "Official reference",
          publisher: "Public institution",
          url: "https://example.gov/reference",
          locator: { kind: "section", value: "Answer" },
          accessedAt: "2026-07-31",
          versionDate: "2026-07-30",
          claimIds: ["claim-1"],
        }],
        mutabilityAssessment: {
          status: "stable",
          reviewerId: "editor",
          reviewedAt: "2026-07-31",
          reasons: ["Canonical definition"],
        },
        bilingualApproval: {
          status: "approved",
          reviewerId: "bilingual",
          reviewedAt: "2026-07-31",
          englishArabicEquivalent: true,
        },
        finalApproval: {
          status: "approved",
          reviewerId: "editor",
          reviewedAt: "2026-08-01",
        },
      },
    },
  };
}

function acceptedProofStore({
  cardId = "example-1",
  artifactPath = "docs/content-review/proof/example.txt",
  artifactSha256,
} = {}) {
  const store = completeEvidenceStore(cardId);
  store.cards[cardId].evidence = [{
    id: "source-1",
    type: "proof",
    status: "accepted",
    artifactPath,
    artifactSha256,
    method: "Re-run the deterministic example calculation.",
    claimIds: ["claim-1"],
  }];
  return store;
}

function proofRootFixture(t) {
  const proofRoot = mkdtempSync(join(tmpdir(), "jakh-content-proof-"));
  t.after(() => rmSync(proofRoot, { recursive: true, force: true }));
  return proofRoot;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("evidence coverage closes only a fully mapped and approved reviewed card", () => {
  const entries = [{ category: "history", card: reviewedCard() }];
  const store = completeEvidenceStore();
  assert.deepEqual(validateEvidenceStore(store, entries), []);

  const coverage = buildEvidenceCoverage(entries, store, { asOf: "2026-08-01" });
  assert.equal(coverage.summary.reviewed, 1);
  assert.equal(coverage.summary.evidenceComplete, 1);
  assert.deepEqual(coverage.cards[0].blockers, []);
});

test("accepted proof evidence rejects a missing artifact", (t) => {
  const proofRoot = proofRootFixture(t);
  const store = acceptedProofStore({ artifactSha256: sha256("expected bytes") });
  const entries = [{ category: "history", card: reviewedCard() }];

  const validation = validateEvidenceStore(store, entries, { proofRoot });
  assert.match(validation.join("\n"), /does not name an existing proof artifact/u);
  assert.equal(buildEvidenceCoverage(entries, store, {
    asOf: "2026-08-01",
    proofRoot,
  }).summary.evidenceComplete, 0);
});

test("accepted proof evidence rejects a digest mismatch after reading the artifact", (t) => {
  const proofRoot = proofRootFixture(t);
  writeFileSync(join(proofRoot, "example.txt"), "actual bytes");
  const store = acceptedProofStore({ artifactSha256: sha256("different bytes") });
  const entries = [{ category: "history", card: reviewedCard() }];

  const validation = validateEvidenceStore(store, entries, { proofRoot });
  assert.match(validation.join("\n"), /does not match the proof artifact bytes/u);
});

test("accepted proof evidence rejects symbolic links and non-files", (t) => {
  const proofRoot = proofRootFixture(t);
  writeFileSync(join(proofRoot, "target.txt"), "proof bytes");
  symlinkSync("target.txt", join(proofRoot, "example.txt"));
  const digest = sha256("proof bytes");
  const entries = [{ category: "history", card: reviewedCard() }];

  const linked = validateEvidenceStore(
    acceptedProofStore({ artifactSha256: digest }),
    entries,
    { proofRoot },
  );
  assert.match(linked.join("\n"), /must not traverse symbolic links/u);

  mkdirSync(join(proofRoot, "directory"));
  const directory = validateEvidenceStore(acceptedProofStore({
    artifactPath: "docs/content-review/proof/directory",
    artifactSha256: digest,
  }), entries, { proofRoot });
  assert.match(directory.join("\n"), /must name a regular file/u);
});

test("accepted proof evidence validates actual bytes beneath the declared root", (t) => {
  const proofRoot = proofRootFixture(t);
  const bytes = Buffer.from("deterministic proof artifact\n", "utf8");
  writeFileSync(join(proofRoot, "example.txt"), bytes);
  const store = acceptedProofStore({ artifactSha256: sha256(bytes) });
  const entries = [{ category: "history", card: reviewedCard() }];

  assert.deepEqual(validateEvidenceStore(store, entries, { proofRoot }), []);
  const coverage = buildEvidenceCoverage(entries, store, {
    asOf: "2026-08-01",
    proofRoot,
  });
  assert.equal(coverage.summary.evidenceComplete, 1);
  assert.deepEqual(coverage.cards[0].blockers, []);
});

test("accepted proof evidence rejects traversal before filesystem access", (t) => {
  const proofRoot = proofRootFixture(t);
  const store = acceptedProofStore({
    artifactPath: "docs/content-review/proof/../outside.txt",
    artifactSha256: sha256("outside"),
  });
  const validation = validateEvidenceStore(
    store,
    [{ category: "history", card: reviewedCard() }],
    { proofRoot },
  );
  assert.match(validation.join("\n"), /must be a safe path under/u);
});

test("evidence coverage rejects nonreciprocal mappings and overdue mutable claims", () => {
  const entries = [{ category: "history", card: reviewedCard() }];
  const store = completeEvidenceStore();
  store.cards["example-1"].claims[0].evidenceIds = [];
  store.cards["example-1"].mutabilityAssessment.status = "mutable";
  store.cards["example-1"].validAsOf = "2026-01-01";
  store.cards["example-1"].reviewDueAt = "2026-07-31";

  const validation = validateEvidenceStore(store, entries);
  assert.match(validation.join("\n"), /mappings must be reciprocal/u);
  const coverage = buildEvidenceCoverage(entries, store, { asOf: "2026-08-01" });
  assert.equal(coverage.summary.evidenceComplete, 0);
  assert.equal(coverage.summary.overdueMutable, 1);
  assert.ok(coverage.cards[0].blockers.includes("evidence-record-invalid"));
  assert.ok(coverage.cards[0].blockers.includes("mutable-review-overdue"));
});

test("high-stakes cards require a qualified independent sign-off", () => {
  const medical = reviewedCard({
    id: "medical-1",
    review: {
      ...reviewedCard().review,
      priority: "high",
      safetySensitive: true,
    },
  });
  const entries = [{ category: "medical-questions", card: medical }];
  const store = completeEvidenceStore("medical-1");
  const coverage = buildEvidenceCoverage(entries, store, { asOf: "2026-08-01" });
  assert.equal(coverage.summary.highStakes.evidenceComplete, 0);
  assert.ok(
    coverage.cards[0].blockers.includes("qualified-high-stakes-signoff-missing-or-future"),
  );
});

test("work queue groups cards deterministically without promoting review status", () => {
  const first = card({
    id: "history-2",
    subcategory: { en: "Ancient history", ar: "التاريخ القديم" },
  });
  const second = reviewedCard({
    id: "history-1",
    subcategory: { en: "Ancient history", ar: "التاريخ القديم" },
  });
  const queue = buildContentReviewWorkQueue([
    { category: "history", card: first },
    { category: "history", card: second },
  ], completeEvidenceStore("history-1"), {
    asOf: "2026-08-01",
    catalogCategories: [{
      slug: "history",
      title: { en: "History", ar: "التاريخ" },
    }],
  });

  assert.equal(queue.summary.packets, 1);
  assert.deepEqual(queue.packets[0].cards.map(({ id }) => id), ["history-1", "history-2"]);
  assert.equal(queue.packets[0].cards[0].reviewStatus, "reviewed");
  assert.equal(queue.packets[0].cards[1].reviewStatus, "pending");
});

test("read-only content CLI modes emit concise CI output", () => {
  const check = spawnSync(process.execPath, [
    "scripts/content-review-report.mjs",
    "--check",
    "--as-of",
    "2026-08-01",
  ], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Content review summary:/u);
  assert.ok(check.stdout.length < 1_000, `check output was ${check.stdout.length} bytes`);

  const complete = spawnSync(process.execPath, [
    "scripts/content-review-report.mjs",
    "--complete",
    "--as-of",
    "2026-08-01",
  ], { encoding: "utf8" });
  assert.equal(complete.status, 1);
  assert.match(complete.stderr, /completion gate failed/u);
  assert.ok(complete.stdout.length < 1_000, `complete output was ${complete.stdout.length} bytes`);
});
