const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const CONTENT_REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_STALE_AFTER_DAYS = 365;
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
    en: /\b(?:current|currently|today|now|present-day|as of)\b/iu,
    ar: /(?:حالي(?:اً|ا)|الحالي(?:ة)?|اليوم|الآن|حتى الآن|في الوقت الحاضر)/u,
  },
  {
    key: "latest-or-newest",
    en: /\b(?:latest|newest|most recent)\b/iu,
    ar: /(?:الأحدث|احدث|الأجدد|اجدد|الأخير(?:ة)?)/u,
  },
  {
    key: "record-or-ranking",
    en: /\b(?:all-time|record holder|record goalscorer|world record|ranked first|number one)\b/iu,
    ar: /(?:على مر العصور|عبر التاريخ|صاحب الرقم القياسي|الرقم القياسي العالمي|المصنف الأول|المرتبة الأولى)/u,
  },
  {
    key: "mutable-superlative",
    en: /\b(?:best-selling|highest-selling|most (?:popular|followed|viewed|valuable|visited)|world(?:'s|’s) (?:largest|tallest|fastest|richest|oldest|youngest))\b/iu,
    ar: /(?:الأكثر مبيعاً|الأكثر مبيعا|الأعلى مبيعاً|الأعلى مبيعا|الأكثر شعبية|الأكثر متابعة|الأكثر مشاهدة|الأكثر قيمة|الأكثر زيارة|الأكبر في العالم|الأطول في العالم|الأسرع في العالم|الأغنى في العالم)/u,
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
