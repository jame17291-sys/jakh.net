import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PROOF_ARTIFACT_PREFIX = "docs/content-review/proof/";

export const CONTENT_REVIEW_SCHEMA_VERSION = 1;
export const CONTENT_EVIDENCE_SCHEMA_VERSION = 1;
export const CONTENT_WORK_QUEUE_SCHEMA_VERSION = 1;
export const REVIEW_STALE_AFTER_DAYS = 365;
export const CONTENT_REVIEW_COMPLETE_TOTAL = 3_553;
export const CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL = 278;
export const CONTENT_WORK_PACKET_TOTAL = 382;
export const CONTENT_REVIEW_PROOF_ROOT = fileURLToPath(
  new URL("../docs/content-review/proof/", import.meta.url),
);
export const HIGH_STAKES_CATEGORIES = new Set([
  "law-middle-east",
  "medical-questions",
  "pharmacy",
  "economics-and-finance",
  "survival",
]);

const mutableLanguagePatterns = [
  {
    key: "current-state",
    en: /\b(?:as of|at present|present-day|today(?:'s)?|currently\s+(?:is|are|has|holds|serves|leads|ranks|known|recognized|classified)|(?:who|what|which|where)\s+(?:is|are)\s+(?:the\s+)?current|current\s+(?:all-time\s+)?(?:president|prime minister|monarch|leader|minister|governor|mayor|champion|holder|record|ranking|rank|population|price|value|rate|version|owner|chief executive|ceo|goalscorer))\b/iu,
    ar: /(?:حتى الآن|في الوقت الحاضر|اعتباراً من|اعتبارا من|اليوم(?:ي|ية)?|(?:الرئيس|رئيس الوزراء|الملك|الحاكم|الوزير|البطل|حامل اللقب|الهداف|السعر|القيمة|المعدل|الإصدار|الترتيب|عدد السكان)\s+الحالي(?:ة)?)/u,
  },
  {
    key: "latest-or-newest",
    en: /\b(?:latest|newest|most recent)\b/iu,
    ar: /(?:الأحدث|احدث|الأجدد|اجدد|الأكثر حداثة)/u,
  },
  {
    key: "record-or-ranking",
    en: /\b(?:all-time|record holder|holds? (?:the |a )?record|record (?:goalscorer|for)|world record|ranked first|number one|top[- ]ranked|top scorer|highest goalscorer)\b/iu,
    ar: /(?:على مر العصور|عبر التاريخ|صاحب الرقم القياسي|يحمل الرقم القياسي|الرقم القياسي العالمي|المصنف الأول|المرتبة الأولى|الهداف الأول|أفضل هداف)/u,
  },
  {
    key: "mutable-superlative",
    en: /\b(?:best-selling|highest-(?:selling|grossing)|most (?:popular|followed|viewed|valuable|visited|spoken|produced|populous)|largest (?:producer|population)|world(?:'s|’s) (?:largest|tallest|fastest|richest|oldest|youngest))\b/iu,
    ar: /(?:الأكثر مبيعاً|الأكثر مبيعا|الأعلى مبيعاً|الأعلى مبيعا|الأعلى إيراداً|الأعلى إيرادا|الأكثر شعبية|الأكثر متابعة|الأكثر مشاهدة|الأكثر قيمة|الأكثر زيارة|الأكثر تحدثاً|الأكثر تحدثا|الأكثر إنتاجاً|الأكثر إنتاجا|أكبر منتج|أكبر عدد سكان|الأكبر في العالم|الأطول في العالم|الأسرع في العالم|الأغنى في العالم)/u,
  },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function normalizeScorableAnswer(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function conciseScorableAnswer(value) {
  const normalized = normalizeScorableAnswer(value);
  return normalized.length > 0
    && normalized.length <= 96
    && normalized.split(" ").length <= 14;
}

export function hasScorableAnswer(card, language) {
  return conciseScorableAnswer(card?.answer?.[language])
    || (
      Array.isArray(card?.acceptedAnswers?.[language])
      && card.acceptedAnswers[language].some(conciseScorableAnswer)
    );
}

export function reviewValidationErrors(review, category) {
  const errors = [];
  const highStakesCategory = HIGH_STAKES_CATEGORIES.has(category);
  if (!isPlainObject(review)) return ["review must be an object"];

  const allowedFields = new Set([
    "status",
    "priority",
    "safetySensitive",
    "reviewedAt",
    "reviewer",
    "sources",
  ]);
  for (const field of Object.keys(review)) {
    if (!allowedFields.has(field)) errors.push(`review contains unsupported field "${field}"`);
  }

  if (!new Set(["pending", "reviewed"]).has(review.status)) {
    errors.push('review.status must be "pending" or "reviewed"');
    return errors;
  }

  if (review.priority !== undefined && review.priority !== "high") {
    errors.push('review.priority, when present, must be "high"');
  }
  if (review.safetySensitive !== undefined && review.safetySensitive !== true) {
    errors.push("review.safetySensitive, when present, must be true");
  }
  if (highStakesCategory && review.safetySensitive !== true) {
    errors.push("high-stakes cards must set review.safetySensitive to true");
  }
  if (highStakesCategory && review.status === "pending" && review.priority !== "high") {
    errors.push('pending high-stakes cards must set review.priority to "high"');
  }

  if (review.status === "pending") {
    for (const field of ["reviewedAt", "reviewer", "sources"]) {
      if (review[field] !== undefined) {
        errors.push(`pending review must not contain ${field}`);
      }
    }
    return errors;
  }

  if (parseIsoDate(review.reviewedAt) === null) {
    errors.push("reviewed cards require a valid review.reviewedAt date (YYYY-MM-DD)");
  }
  if (typeof review.reviewer !== "string" || !review.reviewer.trim()) {
    errors.push("reviewed cards require a nonempty review.reviewer label");
  }
  if (!Array.isArray(review.sources) || review.sources.length === 0) {
    errors.push("reviewed cards require at least one authoritative review.sources entry");
  } else {
    const sourceUrls = new Set();
    for (const [index, source] of review.sources.entries()) {
      const prefix = `review.sources[${index}]`;
      if (!isPlainObject(source)) {
        errors.push(`${prefix} must be an object`);
        continue;
      }
      const sourceFields = Object.keys(source);
      for (const field of sourceFields) {
        if (!new Set(["title", "publisher", "url"]).has(field)) {
          errors.push(`${prefix} contains unsupported field "${field}"`);
        }
      }
      if (typeof source.title !== "string" || !source.title.trim()) {
        errors.push(`${prefix}.title must be nonempty`);
      }
      if (typeof source.publisher !== "string" || !source.publisher.trim()) {
        errors.push(`${prefix}.publisher must identify the authority`);
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(source.url);
      } catch {
        parsedUrl = null;
      }
      if (!parsedUrl || parsedUrl.protocol !== "https:" || !parsedUrl.hostname) {
        errors.push(`${prefix}.url must be an absolute HTTPS URL`);
      } else if (sourceUrls.has(parsedUrl.href)) {
        errors.push(`${prefix}.url duplicates another source URL`);
      } else {
        sourceUrls.add(parsedUrl.href);
      }
    }
  }
  return errors;
}

export function mutableLanguageMatches(card) {
  const english = [card?.question?.en, card?.answer?.en].filter(Boolean).join(" ");
  const arabic = [card?.question?.ar, card?.answer?.ar].filter(Boolean).join(" ");
  return mutableLanguagePatterns
    .filter(({ en, ar }) => en.test(english) || ar.test(arabic))
    .map(({ key }) => key);
}

function daysBetween(earlierTimestamp, laterTimestamp) {
  return Math.floor((laterTimestamp - earlierTimestamp) / 86_400_000);
}

export function buildContentReviewReport(entries, {
  asOf,
  staleAfterDays = REVIEW_STALE_AFTER_DAYS,
} = {}) {
  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  const asOfTimestamp = parseIsoDate(asOfDate);
  if (asOfTimestamp === null) throw new Error(`Invalid --as-of date: ${asOfDate}`);

  const categories = new Map();
  const errors = [];
  const reviewedCards = [];
  const highStakesCards = [];
  const mutableLanguageCandidates = [];
  const staleReviewedCards = [];
  let total = 0;
  let reviewed = 0;
  let pending = 0;
  let scorable = 0;
  let highStakes = 0;
  let highStakesReviewed = 0;
  let highStakesPending = 0;

  for (const { category, card } of entries) {
    total += 1;
    if (!categories.has(category)) {
      categories.set(category, {
        slug: category,
        total: 0,
        reviewed: 0,
        pending: 0,
        scorable: 0,
        highStakes: HIGH_STAKES_CATEGORIES.has(category),
        mutableLanguageCandidates: 0,
        staleReviewed: 0,
      });
    }
    const categorySummary = categories.get(category);
    categorySummary.total += 1;

    const cardErrors = reviewValidationErrors(card?.review, category);
    for (const error of cardErrors) {
      errors.push({ category, id: card?.id || null, error });
    }

    const status = card?.review?.status;
    if (status === "reviewed") {
      reviewed += 1;
      categorySummary.reviewed += 1;
      reviewedCards.push({
        category,
        id: card?.id || null,
        reviewedAt: card.review.reviewedAt || null,
        reviewer: card.review.reviewer || null,
        sources: Array.isArray(card.review.sources) ? structuredClone(card.review.sources) : [],
      });
      const reviewedAtTimestamp = parseIsoDate(card.review.reviewedAt);
      if (reviewedAtTimestamp !== null) {
        const ageDays = daysBetween(reviewedAtTimestamp, asOfTimestamp);
        if (ageDays < 0) {
          errors.push({
            category,
            id: card?.id || null,
            error: `review.reviewedAt ${card.review.reviewedAt} is after report date ${asOfDate}`,
          });
        } else if (ageDays > staleAfterDays) {
          const stale = {
            category,
            id: card?.id || null,
            reviewedAt: card.review.reviewedAt,
            ageDays,
          };
          staleReviewedCards.push(stale);
          categorySummary.staleReviewed += 1;
        }
      }
    } else if (status === "pending") {
      pending += 1;
      categorySummary.pending += 1;
    }

    const cardScorable = hasScorableAnswer(card, "en") && hasScorableAnswer(card, "ar");
    if (cardScorable) {
      scorable += 1;
      categorySummary.scorable += 1;
    }

    if (HIGH_STAKES_CATEGORIES.has(category)) {
      highStakes += 1;
      if (status === "reviewed") highStakesReviewed += 1;
      if (status === "pending") highStakesPending += 1;
      highStakesCards.push({
        category,
        id: card?.id || null,
        status: status || null,
        priority: card?.review?.priority || null,
        safetySensitive: card?.review?.safetySensitive === true,
      });
    }

    const matchedPatterns = mutableLanguageMatches(card);
    if (matchedPatterns.length) {
      mutableLanguageCandidates.push({
        category,
        id: card?.id || null,
        status: status || null,
        matchedPatterns,
        question: {
          en: card?.question?.en || "",
          ar: card?.question?.ar || "",
        },
        answer: {
          en: card?.answer?.en || "",
          ar: card?.answer?.ar || "",
        },
      });
      categorySummary.mutableLanguageCandidates += 1;
    }
  }

  return {
    schemaVersion: CONTENT_REVIEW_SCHEMA_VERSION,
    asOf: asOfDate,
    staleAfterDays,
    summary: {
      total,
      reviewed,
      pending,
      scorable,
      highStakes: {
        categories: [...HIGH_STAKES_CATEGORIES],
        total: highStakes,
        reviewed: highStakesReviewed,
        pending: highStakesPending,
      },
      mutableLanguageCandidates: mutableLanguageCandidates.length,
      staleReviewed: staleReviewedCards.length,
      validationErrors: errors.length,
    },
    categories: [...categories.values()],
    reviewedCards,
    highStakesCards,
    mutableLanguageCandidates,
    staleReviewedCards,
    errors,
  };
}

const evidenceTypes = new Set(["web", "dataset", "canonical-work", "proof"]);
const evidenceStatuses = new Set(["candidate", "accepted"]);
const locatorKinds = new Set([
  "article",
  "chapter",
  "entry",
  "equation",
  "figure",
  "page",
  "paragraph",
  "query",
  "record",
  "section",
  "table",
  "theorem",
  "timestamp",
]);

function nonemptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function exactFields(value, allowed, prefix, errors) {
  if (!isPlainObject(value)) return;
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) errors.push(`${prefix} contains unsupported field "${field}"`);
  }
}

function validateStringArray(value, prefix, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${prefix} must be ${allowEmpty ? "an" : "a nonempty"} array of unique strings`);
    return [];
  }
  const normalized = [];
  const seen = new Set();
  for (const [index, entry] of value.entries()) {
    if (!nonemptyString(entry)) {
      errors.push(`${prefix}[${index}] must be a nonempty string`);
    } else if (seen.has(entry)) {
      errors.push(`${prefix}[${index}] duplicates "${entry}"`);
    } else {
      seen.add(entry);
      normalized.push(entry);
    }
  }
  return normalized;
}

function validHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function validateApproval(approval, prefix, reviewers, requiredRole, errors) {
  if (!isPlainObject(approval)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  exactFields(
    approval,
    new Set(["status", "reviewerId", "reviewedAt", "englishArabicEquivalent"]),
    prefix,
    errors,
  );
  if (approval.status !== "approved") errors.push(`${prefix}.status must be "approved"`);
  if (!nonemptyString(approval.reviewerId) || !reviewers.has(approval.reviewerId)) {
    errors.push(`${prefix}.reviewerId must reference a declared reviewer`);
  } else if (!reviewers.get(approval.reviewerId).roles?.includes(requiredRole)) {
    errors.push(`${prefix}.reviewerId must have the ${requiredRole} role`);
  }
  if (parseIsoDate(approval.reviewedAt) === null) {
    errors.push(`${prefix}.reviewedAt must be a valid YYYY-MM-DD date`);
  }
}

function validateAcceptedProofArtifact(evidence, prefix, proofRoot, errors) {
  const artifactPath = evidence.artifactPath;
  const pathParts = nonemptyString(artifactPath)
    && artifactPath.startsWith(PROOF_ARTIFACT_PREFIX)
    && !artifactPath.includes("\\")
    ? artifactPath.slice(PROOF_ARTIFACT_PREFIX.length).split("/")
    : [];
  const safePath = pathParts.length > 0
    && pathParts.every(part => part && part !== "." && part !== "..");
  if (!safePath) {
    errors.push(`${prefix}.artifactPath must be a safe path under ${PROOF_ARTIFACT_PREFIX}`);
  }

  const digestValid = /^[a-f0-9]{64}$/u.test(evidence.artifactSha256 || "");
  if (!digestValid) {
    errors.push(`${prefix}.artifactSha256 must be a lowercase SHA-256 digest`);
  }
  if (!safePath) return;

  if (!nonemptyString(proofRoot)) {
    errors.push(`${prefix}.artifactPath cannot be verified without a declared proof root`);
    return;
  }

  const declaredRoot = resolve(proofRoot);
  let rootStat;
  try {
    rootStat = lstatSync(declaredRoot);
  } catch {
    errors.push(`${prefix}.artifactPath proof root does not exist`);
    return;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    errors.push(`${prefix}.artifactPath proof root must be a non-symlink directory`);
    return;
  }

  const target = resolve(declaredRoot, ...pathParts);
  const targetRelative = relative(declaredRoot, target);
  if (!targetRelative || targetRelative === ".." || targetRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(targetRelative)) {
    errors.push(`${prefix}.artifactPath resolves outside the declared proof root`);
    return;
  }

  let current = declaredRoot;
  for (const [index, part] of pathParts.entries()) {
    current = resolve(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      errors.push(`${prefix}.artifactPath does not name an existing proof artifact`);
      return;
    }
    if (stat.isSymbolicLink()) {
      errors.push(`${prefix}.artifactPath must not traverse symbolic links`);
      return;
    }
    const last = index === pathParts.length - 1;
    if ((!last && !stat.isDirectory()) || (last && !stat.isFile())) {
      errors.push(`${prefix}.artifactPath must name a regular file`);
      return;
    }
  }

  let canonicalRoot;
  let canonicalTarget;
  try {
    canonicalRoot = realpathSync(declaredRoot);
    canonicalTarget = realpathSync(target);
  } catch {
    errors.push(`${prefix}.artifactPath could not be resolved`);
    return;
  }
  const canonicalRelative = relative(canonicalRoot, canonicalTarget);
  if (
    !canonicalRelative
    || canonicalRelative === ".."
    || canonicalRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(canonicalRelative)
  ) {
    errors.push(`${prefix}.artifactPath resolves outside the declared proof root`);
    return;
  }

  let bytes;
  try {
    bytes = readFileSync(canonicalTarget);
  } catch {
    errors.push(`${prefix}.artifactPath could not be read`);
    return;
  }
  if (digestValid) {
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== evidence.artifactSha256) {
      errors.push(`${prefix}.artifactSha256 does not match the proof artifact bytes`);
    }
  }
}

export function validateEvidenceStore(store, entries = [], {
  proofRoot = CONTENT_REVIEW_PROOF_ROOT,
} = {}) {
  const errors = [];
  if (!isPlainObject(store)) return ["evidence must be an object"];
  exactFields(store, new Set(["schemaVersion", "reviewers", "cards"]), "evidence", errors);
  if (store.schemaVersion !== CONTENT_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`evidence.schemaVersion must be ${CONTENT_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (!isPlainObject(store.reviewers)) errors.push("evidence.reviewers must be an object");
  if (!isPlainObject(store.cards)) errors.push("evidence.cards must be an object");

  const knownCards = new Map();
  for (const entry of entries || []) {
    const cardId = entry?.card?.id;
    if (!nonemptyString(cardId)) continue;
    if (knownCards.has(cardId)) errors.push(`corpus contains duplicate card id "${cardId}"`);
    else knownCards.set(cardId, entry.category);
  }

  const reviewers = new Map();
  for (const [reviewerId, reviewer] of Object.entries(store.reviewers || {})) {
    const prefix = `evidence.reviewers[${JSON.stringify(reviewerId)}]`;
    if (!nonemptyString(reviewerId)) errors.push(`${prefix}: reviewer id must be nonempty`);
    if (!isPlainObject(reviewer)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    exactFields(reviewer, new Set(["displayName", "roles", "qualifications"]), prefix, errors);
    if (!nonemptyString(reviewer.displayName)) errors.push(`${prefix}.displayName must be nonempty`);
    const roles = validateStringArray(reviewer.roles, `${prefix}.roles`, errors);
    if (!Array.isArray(reviewer.qualifications)) {
      errors.push(`${prefix}.qualifications must be an array`);
    } else {
      for (const [index, qualification] of reviewer.qualifications.entries()) {
        const qualificationPrefix = `${prefix}.qualifications[${index}]`;
        if (!isPlainObject(qualification)) {
          errors.push(`${qualificationPrefix} must be an object`);
          continue;
        }
        exactFields(
          qualification,
          new Set(["domain", "credential", "verifiedBy", "verifiedAt"]),
          qualificationPrefix,
          errors,
        );
        for (const field of ["domain", "credential", "verifiedBy"]) {
          if (!nonemptyString(qualification[field])) {
            errors.push(`${qualificationPrefix}.${field} must be nonempty`);
          }
        }
        if (parseIsoDate(qualification.verifiedAt) === null) {
          errors.push(`${qualificationPrefix}.verifiedAt must be a valid YYYY-MM-DD date`);
        }
      }
    }
    reviewers.set(reviewerId, { ...reviewer, roles });
  }

  for (const [cardId, record] of Object.entries(store.cards || {})) {
    const prefix = `evidence.cards[${JSON.stringify(cardId)}]`;
    const category = knownCards.get(cardId);
    if (knownCards.size && !category) errors.push(`${prefix} references an unknown card`);
    if (!isPlainObject(record)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    exactFields(
      record,
      new Set([
        "claims",
        "evidence",
        "mutabilityAssessment",
        "validAsOf",
        "reviewDueAt",
        "bilingualApproval",
        "highStakesSignoff",
        "finalApproval",
      ]),
      prefix,
      errors,
    );

    const claimIds = new Set();
    const claimEvidence = new Map();
    if (!Array.isArray(record.claims)) {
      errors.push(`${prefix}.claims must be an array`);
    } else {
      for (const [index, claim] of record.claims.entries()) {
        const claimPrefix = `${prefix}.claims[${index}]`;
        if (!isPlainObject(claim)) {
          errors.push(`${claimPrefix} must be an object`);
          continue;
        }
        exactFields(claim, new Set(["id", "text", "evidenceIds"]), claimPrefix, errors);
        if (!nonemptyString(claim.id)) errors.push(`${claimPrefix}.id must be nonempty`);
        else if (claimIds.has(claim.id)) errors.push(`${claimPrefix}.id duplicates "${claim.id}"`);
        else claimIds.add(claim.id);
        if (!isPlainObject(claim.text) || !nonemptyString(claim.text.en) || !nonemptyString(claim.text.ar)) {
          errors.push(`${claimPrefix}.text must contain nonempty en and ar claims`);
        } else {
          exactFields(claim.text, new Set(["en", "ar"]), `${claimPrefix}.text`, errors);
        }
        claimEvidence.set(claim.id, validateStringArray(
          claim.evidenceIds,
          `${claimPrefix}.evidenceIds`,
          errors,
          { allowEmpty: true },
        ));
      }
    }

    const evidenceIds = new Set();
    const evidenceClaims = new Map();
    if (!Array.isArray(record.evidence)) {
      errors.push(`${prefix}.evidence must be an array`);
    } else {
      for (const [index, evidence] of record.evidence.entries()) {
        const evidencePrefix = `${prefix}.evidence[${index}]`;
        if (!isPlainObject(evidence)) {
          errors.push(`${evidencePrefix} must be an object`);
          continue;
        }
        exactFields(
          evidence,
          new Set([
            "id",
            "type",
            "status",
            "title",
            "publisher",
            "url",
            "bibliographicId",
            "locator",
            "accessedAt",
            "versionDate",
            "versionLabel",
            "claimIds",
            "artifactPath",
            "artifactSha256",
            "method",
            "notes",
          ]),
          evidencePrefix,
          errors,
        );
        if (!nonemptyString(evidence.id)) errors.push(`${evidencePrefix}.id must be nonempty`);
        else if (evidenceIds.has(evidence.id)) errors.push(`${evidencePrefix}.id duplicates "${evidence.id}"`);
        else evidenceIds.add(evidence.id);
        if (!evidenceTypes.has(evidence.type)) {
          errors.push(`${evidencePrefix}.type must be web, dataset, canonical-work, or proof`);
        }
        if (!evidenceStatuses.has(evidence.status)) {
          errors.push(`${evidencePrefix}.status must be candidate or accepted`);
        }
        const mappedClaims = validateStringArray(
          evidence.claimIds,
          `${evidencePrefix}.claimIds`,
          errors,
          { allowEmpty: evidence.status !== "accepted" },
        );
        evidenceClaims.set(evidence.id, mappedClaims);

        for (const field of ["title", "publisher", "bibliographicId", "versionLabel", "method", "notes"]) {
          if (evidence[field] !== undefined && !nonemptyString(evidence[field])) {
            errors.push(`${evidencePrefix}.${field} must be nonempty when present`);
          }
        }
        if (evidence.url !== undefined && !validHttpsUrl(evidence.url)) {
          errors.push(`${evidencePrefix}.url must be an absolute HTTPS URL when present`);
        }
        for (const field of ["accessedAt", "versionDate"]) {
          if (evidence[field] !== undefined && parseIsoDate(evidence[field]) === null) {
            errors.push(`${evidencePrefix}.${field} must be a valid YYYY-MM-DD date`);
          }
        }
        if (evidence.locator !== undefined) {
          if (!isPlainObject(evidence.locator)) {
            errors.push(`${evidencePrefix}.locator must be an object`);
          } else {
            exactFields(evidence.locator, new Set(["kind", "value"]), `${evidencePrefix}.locator`, errors);
            if (!locatorKinds.has(evidence.locator.kind)) {
              errors.push(`${evidencePrefix}.locator.kind is not a supported precise locator`);
            }
            if (!nonemptyString(evidence.locator.value)) {
              errors.push(`${evidencePrefix}.locator.value must be nonempty`);
            }
          }
        }

        if (evidence.type === "proof") {
          if (evidence.status === "accepted") {
            validateAcceptedProofArtifact(evidence, evidencePrefix, proofRoot, errors);
            if (!nonemptyString(evidence.method)) {
              errors.push(`${evidencePrefix}.method must explain how the proof was produced`);
            }
          }
        } else if (evidence.status === "accepted") {
          for (const field of ["title", "publisher", "accessedAt"]) {
            if (!nonemptyString(evidence[field])) errors.push(`${evidencePrefix}.${field} is required when accepted`);
          }
          if (evidence.type !== "canonical-work" && !validHttpsUrl(evidence.url)) {
            errors.push(`${evidencePrefix}.url is required and must use HTTPS when accepted`);
          }
          if (evidence.type === "canonical-work" && !validHttpsUrl(evidence.url) && !nonemptyString(evidence.bibliographicId)) {
            errors.push(`${evidencePrefix} requires an HTTPS URL or bibliographicId when accepted`);
          }
          if (!isPlainObject(evidence.locator)) {
            errors.push(`${evidencePrefix}.locator is required when accepted`);
          }
          if (!nonemptyString(evidence.versionLabel) && parseIsoDate(evidence.versionDate) === null) {
            errors.push(`${evidencePrefix} requires versionDate or versionLabel when accepted`);
          }
        }
      }
    }

    for (const [claimId, mappedEvidence] of claimEvidence) {
      for (const evidenceId of mappedEvidence) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(`${prefix}: claim "${claimId}" references unknown evidence "${evidenceId}"`);
        } else if (!(evidenceClaims.get(evidenceId) || []).includes(claimId)) {
          errors.push(`${prefix}: claim "${claimId}" and evidence "${evidenceId}" mappings must be reciprocal`);
        }
      }
    }
    for (const [evidenceId, mappedClaims] of evidenceClaims) {
      for (const claimId of mappedClaims) {
        if (!claimIds.has(claimId)) {
          errors.push(`${prefix}: evidence "${evidenceId}" references unknown claim "${claimId}"`);
        } else if (!(claimEvidence.get(claimId) || []).includes(evidenceId)) {
          errors.push(`${prefix}: evidence "${evidenceId}" and claim "${claimId}" mappings must be reciprocal`);
        }
      }
    }

    if (record.mutabilityAssessment !== undefined) {
      const assessment = record.mutabilityAssessment;
      const assessmentPrefix = `${prefix}.mutabilityAssessment`;
      if (!isPlainObject(assessment)) {
        errors.push(`${assessmentPrefix} must be an object`);
      } else {
        exactFields(assessment, new Set(["status", "reviewerId", "reviewedAt", "reasons"]), assessmentPrefix, errors);
        if (!new Set(["stable", "mutable"]).has(assessment.status)) {
          errors.push(`${assessmentPrefix}.status must be stable or mutable`);
        }
        if (!nonemptyString(assessment.reviewerId) || !reviewers.has(assessment.reviewerId)) {
          errors.push(`${assessmentPrefix}.reviewerId must reference a declared reviewer`);
        } else if (!reviewers.get(assessment.reviewerId).roles?.some(role => ["editor", "fact-checker"].includes(role))) {
          errors.push(`${assessmentPrefix}.reviewerId must have the editor or fact-checker role`);
        }
        if (parseIsoDate(assessment.reviewedAt) === null) {
          errors.push(`${assessmentPrefix}.reviewedAt must be a valid YYYY-MM-DD date`);
        }
        validateStringArray(assessment.reasons, `${assessmentPrefix}.reasons`, errors);
      }
    }
    for (const field of ["validAsOf", "reviewDueAt"]) {
      if (record[field] !== undefined && parseIsoDate(record[field]) === null) {
        errors.push(`${prefix}.${field} must be a valid YYYY-MM-DD date`);
      }
    }
    if (record.mutabilityAssessment?.status === "mutable") {
      if (parseIsoDate(record.validAsOf) === null) errors.push(`${prefix}.validAsOf is required for mutable content`);
      if (parseIsoDate(record.reviewDueAt) === null) errors.push(`${prefix}.reviewDueAt is required for mutable content`);
      if (
        parseIsoDate(record.validAsOf) !== null
        && parseIsoDate(record.reviewDueAt) !== null
        && parseIsoDate(record.reviewDueAt) < parseIsoDate(record.validAsOf)
      ) errors.push(`${prefix}.reviewDueAt must not be before validAsOf`);
    }

    if (record.bilingualApproval !== undefined) {
      validateApproval(record.bilingualApproval, `${prefix}.bilingualApproval`, reviewers, "bilingual-reviewer", errors);
      if (record.bilingualApproval?.englishArabicEquivalent !== true) {
        errors.push(`${prefix}.bilingualApproval.englishArabicEquivalent must be true`);
      }
    }
    if (record.finalApproval !== undefined) {
      validateApproval(record.finalApproval, `${prefix}.finalApproval`, reviewers, "editor", errors);
      if (record.finalApproval?.englishArabicEquivalent !== undefined) {
        errors.push(`${prefix}.finalApproval must not contain englishArabicEquivalent`);
      }
    }
    if (record.highStakesSignoff !== undefined) {
      const signoff = record.highStakesSignoff;
      const signoffPrefix = `${prefix}.highStakesSignoff`;
      if (!isPlainObject(signoff)) {
        errors.push(`${signoffPrefix} must be an object`);
      } else {
        exactFields(
          signoff,
          new Set([
            "status",
            "reviewerId",
            "reviewedAt",
            "domain",
            "qualification",
            "independenceAttested",
          ]),
          signoffPrefix,
          errors,
        );
        if (signoff.status !== "approved") errors.push(`${signoffPrefix}.status must be "approved"`);
        if (parseIsoDate(signoff.reviewedAt) === null) {
          errors.push(`${signoffPrefix}.reviewedAt must be a valid YYYY-MM-DD date`);
        }
        if (!nonemptyString(signoff.domain)) errors.push(`${signoffPrefix}.domain must be nonempty`);
        if (category && signoff.domain !== category) {
          errors.push(`${signoffPrefix}.domain must match the card category "${category}"`);
        }
        if (!nonemptyString(signoff.qualification)) {
          errors.push(`${signoffPrefix}.qualification must identify the applicable credential`);
        }
        if (signoff.independenceAttested !== true) {
          errors.push(`${signoffPrefix}.independenceAttested must be true`);
        }
        const reviewer = reviewers.get(signoff.reviewerId);
        if (!reviewer || !reviewer.roles?.includes("subject-matter-expert")) {
          errors.push(`${signoffPrefix}.reviewerId must reference a subject-matter-expert`);
        } else if (!reviewer.qualifications?.some(qualification => (
          qualification.domain === signoff.domain
          && qualification.credential === signoff.qualification
        ))) {
          errors.push(`${signoffPrefix} is not backed by the reviewer's verified qualification`);
        }
      }
    }
  }
  return errors;
}

function approvedOnOrBefore(approval, asOfTimestamp) {
  const reviewedAt = parseIsoDate(approval?.reviewedAt);
  return approval?.status === "approved" && reviewedAt !== null && reviewedAt <= asOfTimestamp;
}

export function buildEvidenceCoverage(entries, store, {
  asOf,
  proofRoot = CONTENT_REVIEW_PROOF_ROOT,
} = {}) {
  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  const asOfTimestamp = parseIsoDate(asOfDate);
  if (asOfTimestamp === null) throw new Error(`Invalid --as-of date: ${asOfDate}`);
  const validationErrors = validateEvidenceStore(store, entries, { proofRoot });
  const cards = [];
  let reviewed = 0;
  let pending = 0;
  let evidenceComplete = 0;
  let candidateEvidence = 0;
  let acceptedEvidence = 0;
  let proofArtifacts = 0;
  let overdueMutable = 0;
  let highStakesTotal = 0;
  let highStakesReviewed = 0;
  let highStakesEvidenceComplete = 0;

  for (const { category, card } of entries) {
    const blockers = [];
    const status = card?.review?.status;
    if (status === "reviewed") reviewed += 1;
    if (status === "pending") pending += 1;
    if (status !== "reviewed") blockers.push("legacy-review-status-not-reviewed");
    const highStakes = HIGH_STAKES_CATEGORIES.has(category);
    if (highStakes) {
      highStakesTotal += 1;
      if (status === "reviewed") highStakesReviewed += 1;
    }

    const record = store?.cards?.[card.id];
    const recordEvidence = Array.isArray(record?.evidence) ? record.evidence : [];
    candidateEvidence += recordEvidence.filter(item => item?.status === "candidate").length;
    acceptedEvidence += recordEvidence.filter(item => item?.status === "accepted").length;
    proofArtifacts += recordEvidence.filter(item => item?.status === "accepted" && item?.type === "proof").length;

    if (!record) {
      blockers.push("evidence-record-missing");
    } else {
      const cardPrefix = `evidence.cards[${JSON.stringify(card.id)}]`;
      if (validationErrors.some(error => error.startsWith(cardPrefix))) {
        blockers.push("evidence-record-invalid");
      }
      const claims = Array.isArray(record.claims) ? record.claims : [];
      const acceptedById = new Map(
        recordEvidence.filter(item => item?.status === "accepted").map(item => [item.id, item]),
      );
      if (!claims.length) blockers.push("atomic-claims-missing");
      for (const claim of claims) {
        if (!(claim?.evidenceIds || []).some(id => acceptedById.has(id))) {
          blockers.push(`claim-${claim?.id || "unknown"}-lacks-accepted-evidence`);
        }
      }
      if (!acceptedById.size) blockers.push("accepted-evidence-missing");

      const datedInputs = [];
      for (const evidence of acceptedById.values()) {
        for (const field of ["accessedAt", "versionDate"]) {
          const timestamp = parseIsoDate(evidence[field]);
          if (timestamp !== null) {
            datedInputs.push(timestamp);
            if (timestamp > asOfTimestamp) blockers.push(`accepted-evidence-${field}-is-in-the-future`);
          }
        }
      }

      const mutability = record.mutabilityAssessment;
      const mutabilityTimestamp = parseIsoDate(mutability?.reviewedAt);
      if (!new Set(["stable", "mutable"]).has(mutability?.status) || mutabilityTimestamp === null) {
        blockers.push("mutability-assessment-missing");
      } else {
        datedInputs.push(mutabilityTimestamp);
        if (mutabilityTimestamp > asOfTimestamp) blockers.push("mutability-assessment-is-in-the-future");
      }
      if (mutability?.status === "mutable") {
        const validAsOf = parseIsoDate(record.validAsOf);
        const reviewDueAt = parseIsoDate(record.reviewDueAt);
        if (validAsOf === null || reviewDueAt === null) {
          blockers.push("mutable-review-window-missing");
        } else {
          datedInputs.push(validAsOf);
          if (validAsOf > asOfTimestamp) blockers.push("valid-as-of-is-in-the-future");
          if (reviewDueAt < asOfTimestamp) {
            blockers.push("mutable-review-overdue");
            overdueMutable += 1;
          }
        }
      }

      if (!approvedOnOrBefore(record.bilingualApproval, asOfTimestamp)) {
        blockers.push("bilingual-approval-missing-or-future");
      } else {
        datedInputs.push(parseIsoDate(record.bilingualApproval.reviewedAt));
      }
      if (highStakes) {
        if (!approvedOnOrBefore(record.highStakesSignoff, asOfTimestamp)) {
          blockers.push("qualified-high-stakes-signoff-missing-or-future");
        } else {
          datedInputs.push(parseIsoDate(record.highStakesSignoff.reviewedAt));
        }
      }
      const finalTimestamp = parseIsoDate(record.finalApproval?.reviewedAt);
      if (!approvedOnOrBefore(record.finalApproval, asOfTimestamp)) {
        blockers.push("final-approval-missing-or-future");
      } else if (datedInputs.some(timestamp => timestamp > finalTimestamp)) {
        blockers.push("final-approval-predates-review-input");
      }
      const legacyReviewTimestamp = parseIsoDate(card?.review?.reviewedAt);
      if (finalTimestamp !== null && legacyReviewTimestamp !== null && legacyReviewTimestamp < finalTimestamp) {
        blockers.push("legacy-review-date-predates-final-approval");
      }
    }

    const uniqueBlockers = [...new Set(blockers)];
    const complete = uniqueBlockers.length === 0;
    if (complete) {
      evidenceComplete += 1;
      if (highStakes) highStakesEvidenceComplete += 1;
    }
    cards.push({
      category,
      id: card.id,
      reviewStatus: status || null,
      highStakes,
      evidenceComplete: complete,
      blockers: uniqueBlockers,
    });
  }

  return {
    schemaVersion: CONTENT_EVIDENCE_SCHEMA_VERSION,
    asOf: asOfDate,
    summary: {
      total: entries.length,
      reviewed,
      pending,
      evidenceComplete,
      candidateEvidence,
      acceptedEvidence,
      proofArtifacts,
      overdueMutable,
      highStakes: {
        total: highStakesTotal,
        reviewed: highStakesReviewed,
        evidenceComplete: highStakesEvidenceComplete,
      },
      validationErrors: validationErrors.length,
    },
    cards,
    validationErrors,
  };
}

function wordCount(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function packetSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 64) || "topic";
}

export function buildContentReviewWorkQueue(entries, store, {
  asOf,
  catalogCategories = [],
} = {}) {
  const coverage = buildEvidenceCoverage(entries, store, { asOf });
  const coverageById = new Map(coverage.cards.map(item => [item.id, item]));
  const metadataBySlug = new Map(catalogCategories.map(category => [category.slug, category]));
  const categoryOrder = new Map(catalogCategories.map((category, index) => [category.slug, index]));
  const groups = new Map();

  for (const entry of entries) {
    const subcategory = entry.card?.subcategory;
    const key = `${entry.category}\u0000${subcategory?.en || ""}\u0000${subcategory?.ar || ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category: entry.category,
        subcategory: {
          en: subcategory?.en || "",
          ar: subcategory?.ar || "",
        },
        entries: [],
      });
    }
    groups.get(key).entries.push(entry);
  }

  const packetIds = new Set();
  const packets = [...groups.values()]
    .sort((left, right) => (
      (categoryOrder.get(left.category) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(right.category) ?? Number.MAX_SAFE_INTEGER)
      || left.subcategory.en.localeCompare(right.subcategory.en, "en")
      || left.subcategory.ar.localeCompare(right.subcategory.ar, "ar")
    ))
    .map((group, packetIndex) => {
      const id = `${group.category}--${packetSlug(group.subcategory.en)}`;
      if (packetIds.has(id)) throw new Error(`Work-packet id collision: ${id}`);
      packetIds.add(id);
      const highStakes = HIGH_STAKES_CATEGORIES.has(group.category);
      const cards = group.entries
        .slice()
        .sort((left, right) => left.card.id.localeCompare(right.card.id, "en"))
        .map(({ card }) => {
          const evidenceRecord = store?.cards?.[card.id];
          const evidence = Array.isArray(evidenceRecord?.evidence) ? evidenceRecord.evidence : [];
          const answerWords = {
            en: wordCount(card.answer?.en),
            ar: wordCount(card.answer?.ar),
          };
          return {
            id: card.id,
            difficulty: card.difficulty || null,
            reviewStatus: card.review?.status || null,
            highStakes,
            mutableSignals: mutableLanguageMatches(card),
            contentSignals: {
              answerWords,
              containsNumber: /\p{N}/u.test(`${card.question?.en || ""} ${card.answer?.en || ""} ${card.question?.ar || ""} ${card.answer?.ar || ""}`),
              containsYear: /\b(?:1[5-9]\d{2}|20\d{2}|21\d{2})\b/u.test(`${card.question?.en || ""} ${card.answer?.en || ""}`),
              needsClaimDecomposition: answerWords.en > 30 || answerWords.ar > 30,
            },
            legacyReviewSources: Array.isArray(card.review?.sources)
              ? structuredClone(card.review.sources)
              : [],
            evidenceState: {
              claims: Array.isArray(evidenceRecord?.claims) ? evidenceRecord.claims.length : 0,
              candidates: evidence.filter(item => item?.status === "candidate").length,
              accepted: evidence.filter(item => item?.status === "accepted").length,
              complete: coverageById.get(card.id)?.evidenceComplete === true,
              blockers: coverageById.get(card.id)?.blockers || ["coverage-record-missing"],
            },
          };
        });
      const metadata = metadataBySlug.get(group.category);
      return {
        sequence: packetIndex + 1,
        id,
        category: {
          slug: group.category,
          title: structuredClone(metadata?.title || { en: group.category, ar: group.category }),
        },
        subcategory: group.subcategory,
        priority: highStakes ? "high" : "standard",
        highStakes,
        cardCount: cards.length,
        cards,
      };
    });

  return {
    schemaVersion: CONTENT_WORK_QUEUE_SCHEMA_VERSION,
    asOf: coverage.asOf,
    sourcePolicy: {
      discoveryBatch: "One packet may share source-discovery work only within this exact category/subcategory group.",
      claimMapping: "Every atomic claim must map reciprocally to accepted evidence with a precise locator.",
      statusIntegrity: "Candidate or accepted evidence never changes a card's review.status automatically.",
      highStakes: "High-stakes completion requires an independent sign-off backed by a verified domain qualification.",
    },
    summary: {
      packets: packets.length,
      cards: entries.length,
      reviewed: coverage.summary.reviewed,
      pending: coverage.summary.pending,
      evidenceComplete: coverage.summary.evidenceComplete,
      highStakes: structuredClone(coverage.summary.highStakes),
      candidateEvidence: coverage.summary.candidateEvidence,
      acceptedEvidence: coverage.summary.acceptedEvidence,
      validationErrors: coverage.summary.validationErrors,
    },
    packets,
    validationErrors: coverage.validationErrors,
  };
}
