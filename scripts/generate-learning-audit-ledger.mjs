#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HIGH_STAKES_CATEGORIES,
  buildEvidenceCoverage,
  mutableLanguageMatches,
} from "./content-review-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "docs", "content-review", "learning-audit-ledger.json");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");

function optionValue(option) {
  const index = args.indexOf(option);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function contentVersion(card) {
  return createHash("sha256").update(JSON.stringify(card)).digest("hex");
}

function runtimeProjection(category) {
  return HIGH_STAKES_CATEGORIES.has(category) ? "quarantined" : "public-legacy-projection";
}

function programmeEligibility(evidenceComplete) {
  return evidenceComplete ? "eligible" : "held-pending-substantive-review";
}

function loadEntries(catalog) {
  const entries = [];
  for (const category of catalog.categories || []) {
    const cards = JSON.parse(fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"));
    if (!Array.isArray(cards)) throw new Error(`Invalid card data for ${category.slug}`);
    for (const card of cards) entries.push({ category, card });
  }
  return entries;
}

function persistedAsOf() {
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")).asOf || null;
  } catch {
    return null;
  }
}

function buildLedger(entries, evidenceStore, asOf) {
  const coverage = buildEvidenceCoverage(
    entries.map(({ category, card }) => ({ category: category.slug, card })),
    evidenceStore,
    { asOf },
  );
  if (coverage.validationErrors.length) {
    throw new Error(`Content evidence has ${coverage.validationErrors.length} validation error(s)`);
  }
  const coverageById = new Map(coverage.cards.map((record) => [record.id, record]));
  const cards = entries.map(({ category, card }) => {
    const evidence = coverageById.get(card.id);
    const evidenceComplete = evidence?.evidenceComplete === true;
    return {
      id: card.id,
      contentVersion: contentVersion(card),
      classification: {
        category: category.slug,
        categoryTitle: category.title,
        subcategory: card.subcategory || null,
        difficulty: card.difficulty || null,
        contentFormat: "bilingual-question-answer",
        highStakes: HIGH_STAKES_CATEGORIES.has(category.slug),
        mutableLanguageSignals: mutableLanguageMatches(card),
      },
      audience: {
        status: "unclassified",
        segments: [],
      },
      prerequisites: {
        status: "not-assessed",
        requirements: [],
      },
      learningObjective: {
        status: "not-authored",
        objectives: [],
      },
      defects: {
        status: "not-assessed",
        findings: [],
      },
      evidence: {
        status: evidenceComplete ? "complete" : "incomplete",
        acceptedCount: evidence?.acceptedEvidence || 0,
        candidateCount: evidence?.candidateEvidence || 0,
      },
      review: {
        sourceStatus: card.review?.status || "invalid",
        substantiveStatus: evidenceComplete ? "evidence-complete" : "not-started",
        languages: {
          en: evidenceComplete ? "approved" : "not-reviewed",
          ar: evidenceComplete ? "approved" : "not-reviewed",
          equivalence: evidenceComplete ? "approved" : "not-reviewed",
        },
        formats: {
          question: "not-reviewed",
          answer: "not-reviewed",
          explanation: card.explanation ? "not-reviewed" : "not-present",
          hints: Array.isArray(card.hints) && card.hints.length ? "not-reviewed" : "not-present",
          choices: Array.isArray(card.choices) && card.choices.length ? "not-reviewed" : "not-present",
          mediaLabels: "not-present",
        },
        reviewerTypes: [],
        completedAt: null,
        uncertainty: evidenceComplete ? [] : ["substantive-review-not-yet-recorded"],
        disposition: evidenceComplete ? "approved" : "unreviewed",
        blockers: evidence?.blockers || ["coverage-record-missing"],
      },
      publication: {
        programmeEligibility: programmeEligibility(evidenceComplete),
        currentRuntimeProjection: runtimeProjection(category.slug),
      },
    };
  });
  const summary = cards.reduce((result, card) => {
    result.total += 1;
    result.byDisposition[card.review.disposition] = (result.byDisposition[card.review.disposition] || 0) + 1;
    result.byProgrammeEligibility[card.publication.programmeEligibility] = (
      result.byProgrammeEligibility[card.publication.programmeEligibility] || 0
    ) + 1;
    result.byRuntimeProjection[card.publication.currentRuntimeProjection] = (
      result.byRuntimeProjection[card.publication.currentRuntimeProjection] || 0
    ) + 1;
    return result;
  }, {
    total: 0,
    byDisposition: {},
    byProgrammeEligibility: {},
    byRuntimeProjection: {},
  });
  return {
    schemaVersion: 1,
    asOf,
    purpose: "Programme audit ledger. Generated fields describe recorded state, never an inferred factual or human-review approval.",
    summary,
    cards,
  };
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const evidenceStore = JSON.parse(
  fs.readFileSync(path.join(root, "docs", "content-review", "evidence.json"), "utf8"),
);
const asOf = optionValue("--as-of") || persistedAsOf() || new Date().toISOString().slice(0, 10);
const ledger = buildLedger(loadEntries(catalog), evidenceStore, asOf);
// The ledger is intentionally a compact generated machine record. Keeping a
// 3,553-card projection minified prevents a formatting-only change from
// obscuring substantive review updates in repository history.
const serialized = `${JSON.stringify(ledger)}\n`;
const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";

if (checkOnly) {
  if (current !== serialized) {
    process.stderr.write("docs/content-review/learning-audit-ledger.json is stale. Run node scripts/generate-learning-audit-ledger.mjs.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`Learning audit ledger is current: ${ledger.summary.total} cards.\n`);
  }
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  process.stdout.write(`Generated learning audit ledger for ${ledger.summary.total} cards.\n`);
}
