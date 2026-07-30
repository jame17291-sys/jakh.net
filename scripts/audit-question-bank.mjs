import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const allowlist = JSON.parse(
  fs.readFileSync(path.join(root, "scripts", "question-similarity-allowlist.json"), "utf8"),
);

const EN_STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "by", "called", "can",
  "could", "describe", "did", "do", "does", "for", "from", "give", "how", "in",
  "is", "it", "its", "known", "name", "of", "on", "or", "refers", "term", "that",
  "the", "this", "to", "type", "used", "was", "were", "what", "when", "where",
  "which", "who", "why", "with",
]);

const AR_STOP_WORDS = new Set([
  "أين", "إلى", "الى", "التي", "الذي", "الذين", "أن", "ان", "أي", "اي", "بـ",
  "عن", "على", "في", "كان", "كانت", "كيف", "لـ", "لماذا", "ما", "ماذا", "متى",
  "من", "منذ", "هو", "هي", "و", "ولا", "يطلق", "يعرف", "يسمى",
]);

function normalize(value, language) {
  let text = String(value || "").normalize("NFKD").toLowerCase();
  if (language === "ar") {
    text = text
      .replace(/[\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
      .replace(/[أإآٱ]/gu, "ا")
      .replace(/ى/gu, "ي")
      .replace(/ؤ/gu, "و")
      .replace(/ئ/gu, "ي");
  } else {
    text = text.replace(/\p{M}/gu, "");
  }
  return text.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stemEnglish(token) {
  if (token.length <= 4) return token;
  if (token.endsWith("ies") && token.length > 5) return `${token.slice(0, -3)}y`;
  for (const suffix of ["ingly", "edly", "ing", "ed", "es", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function tokens(value, language) {
  const stopWords = language === "ar" ? AR_STOP_WORDS : EN_STOP_WORDS;
  return normalize(value, language)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !stopWords.has(token))
    .map((token) => language === "en" ? stemEnglish(token) : token);
}

function tokenSimilarity(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(a.size, b.size);
  return (jaccard * 0.45) + (containment * 0.55);
}

function ngrams(value, size = 3) {
  const compact = value.replace(/\s+/gu, " ");
  if (compact.length <= size) return new Set([compact]);
  const result = new Set();
  for (let index = 0; index <= compact.length - size; index += 1) {
    result.add(compact.slice(index, index + size));
  }
  return result;
}

function characterSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = ngrams(left);
  const b = ngrams(right);
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function pairedSimilarity(left, right) {
  const enToken = tokenSimilarity(left.questionTokens.en, right.questionTokens.en);
  const arToken = tokenSimilarity(left.questionTokens.ar, right.questionTokens.ar);
  const enChar = characterSimilarity(left.normalized.question.en, right.normalized.question.en);
  const arChar = characterSimilarity(left.normalized.question.ar, right.normalized.question.ar);
  const answerEn = characterSimilarity(left.normalized.answer.en, right.normalized.answer.en);
  const answerAr = characterSimilarity(left.normalized.answer.ar, right.normalized.answer.ar);
  const answerEnToken = tokenSimilarity(left.answerTokens.en, right.answerTokens.en);
  const answerArToken = tokenSimilarity(left.answerTokens.ar, right.answerTokens.ar);
  const sameAnswerEn = left.normalized.answer.en === right.normalized.answer.en;
  const sameAnswerAr = left.normalized.answer.ar === right.normalized.answer.ar;
  return {
    question: Math.max(enToken, arToken, enChar, arChar),
    answer: Math.max(answerEn, answerAr, answerEnToken, answerArToken),
    enToken,
    arToken,
    enChar,
    arChar,
    answerEnToken,
    answerArToken,
    sameAnswerEn,
    sameAnswerAr,
    sameAnswerBoth: sameAnswerEn && sameAnswerAr,
  };
}

function loadCards() {
  const cards = [];
  for (const category of catalog.categories || []) {
    const source = JSON.parse(
      fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"),
    );
    if (!Array.isArray(source)) throw new Error(`Invalid card data for ${category.slug}`);
    const categoryCards = source;
    for (const [index, card] of categoryCards.entries()) {
      cards.push({
        id: card.id,
        slug: category.slug,
        index,
        difficulty: card.difficulty,
        subcategory: card.subcategory || null,
        question: card.question,
        answer: card.answer,
        normalized: {
          question: {
            en: normalize(card.question?.en, "en"),
            ar: normalize(card.question?.ar, "ar"),
          },
          answer: {
            en: normalize(card.answer?.en, "en"),
            ar: normalize(card.answer?.ar, "ar"),
          },
        },
        questionTokens: {
          en: tokens(card.question?.en, "en"),
          ar: tokens(card.question?.ar, "ar"),
        },
        answerTokens: {
          en: tokens(card.answer?.en, "en"),
          ar: tokens(card.answer?.ar, "ar"),
        },
      });
    }
  }
  return cards;
}

function groupBy(cards, keyOf) {
  const groups = new Map();
  for (const card of cards) {
    const key = keyOf(card);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function compactCard(card) {
  return {
    id: card.id,
    category: card.slug,
    index: card.index,
    difficulty: card.difficulty,
    subcategory: card.subcategory?.en || "",
    question: card.question.en,
    questionAr: card.question.ar,
    answer: card.answer.en,
    answerAr: card.answer.ar,
  };
}

function pairKey(leftId, rightId) {
  return [leftId, rightId].sort().join("::");
}

function exactComponents(cards) {
  const parent = new Map(cards.map((card) => [card.id, card.id]));
  const byId = new Map(cards.map((card) => [card.id, card]));

  function find(id) {
    const current = parent.get(id);
    if (current !== id) parent.set(id, find(current));
    return parent.get(id);
  }

  function union(left, right) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  }

  for (const group of [
    ...groupBy(cards, (card) => card.normalized.question.en),
    ...groupBy(cards, (card) => card.normalized.question.ar),
  ]) {
    for (let index = 1; index < group.length; index += 1) {
      union(group[0].id, group[index].id);
    }
  }

  const components = new Map();
  for (const id of parent.keys()) {
    const rootId = find(id);
    if (!components.has(rootId)) components.set(rootId, []);
    components.get(rootId).push(byId.get(id));
  }
  return [...components.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length || left[0].id.localeCompare(right[0].id));
}

function semanticCandidates(cards, exactPairs) {
  const byAnswer = new Map();
  for (const card of cards) {
    for (const key of [
      `en:${card.normalized.answer.en}`,
      `ar:${card.normalized.answer.ar}`,
    ]) {
      if (key.endsWith(":")) continue;
      if (!byAnswer.has(key)) byAnswer.set(key, []);
      byAnswer.get(key).push(card);
    }
  }

  const candidateKeys = new Set();
  const candidates = [];
  const seen = new Set(exactPairs);

  function consider(left, right) {
    const key = pairKey(left.id, right.id);
    if (seen.has(key) || candidateKeys.has(key)) return;
    const scores = pairedSimilarity(left, right);
    const sameCategory = left.slug === right.slug;
    const answerExact = scores.sameAnswerEn || scores.sameAnswerAr;
    const answerElaboration = scores.answerEnToken >= 0.74 || scores.answerArToken >= 0.74;
    const highQuestionOverlap = (
      scores.enToken >= 0.62
      || scores.arToken >= 0.62
      || scores.enChar >= 0.78
      || scores.arChar >= 0.78
    );
    const sameFactShape = answerExact && (
      scores.enToken >= (sameCategory ? 0.30 : 0.38)
      || scores.arToken >= (sameCategory ? 0.30 : 0.38)
      || scores.enChar >= 0.58
      || scores.arChar >= 0.58
    );
    const elaboratedAnswerShape = answerElaboration && (
      scores.enToken >= 0.36
      || scores.arToken >= 0.36
      || scores.enChar >= 0.52
      || scores.arChar >= 0.52
    );
    const paraphraseShape = highQuestionOverlap && scores.answer >= 0.56;
    if (!sameFactShape && !elaboratedAnswerShape && !paraphraseShape) return;

    candidateKeys.add(key);
    candidates.push({
      key,
      confidence: Number((
        (scores.question * 0.68)
        + (scores.answer * 0.22)
        + (scores.sameAnswerBoth ? 0.10 : answerExact ? 0.06 : 0)
      ).toFixed(4)),
      reason: sameFactShape
        ? "same-answer-and-question-overlap"
        : elaboratedAnswerShape
          ? "answer-elaboration-and-question-overlap"
          : "near-question-and-answer",
      sameCategory,
      scores,
      left: compactCard(left),
      right: compactCard(right),
    });
  }

  for (const group of byAnswer.values()) {
    if (group.length > 80) continue;
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        consider(group[left], group[right]);
      }
    }
  }

  for (let left = 0; left < cards.length; left += 1) {
    for (let right = left + 1; right < cards.length; right += 1) {
      if (cards[left].slug !== cards[right].slug) continue;
      consider(cards[left], cards[right]);
    }
  }

  return candidates.sort((left, right) => (
    right.confidence - left.confidence
    || left.key.localeCompare(right.key)
  ));
}

const cards = loadCards();
const cardsById = new Map(cards.map((card) => [card.id, card]));
const reviewedDistinctPairs = new Map();
for (const [index, entry] of (allowlist.reviewedDistinctPairs || []).entries()) {
  if (!Array.isArray(entry?.ids) || entry.ids.length !== 2 || !entry.reason?.trim()) {
    throw new Error(`Invalid reviewed distinct pair at allowlist entry ${index + 1}`);
  }
  for (const id of entry.ids) {
    if (!cardsById.has(id)) throw new Error(`Allowlist references unknown card id ${id}`);
  }
  const key = pairKey(...entry.ids);
  if (reviewedDistinctPairs.has(key)) throw new Error(`Duplicate allowlist pair ${key}`);
  reviewedDistinctPairs.set(key, entry.reason.trim());
}
const exactGroups = exactComponents(cards);
const exactPairs = new Set();
for (const group of exactGroups) {
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      exactPairs.add(pairKey(group[left].id, group[right].id));
    }
  }
}
const candidates = semanticCandidates(cards, exactPairs);
const annotatedCandidates = candidates.map((candidate) => ({
  ...candidate,
  reviewedDistinct: reviewedDistinctPairs.has(candidate.key),
  reviewReason: reviewedDistinctPairs.get(candidate.key) || "",
}));
const unreviewedCandidates = annotatedCandidates.filter((candidate) => !candidate.reviewedDistinct);
const report = {
  summary: {
    cards: cards.length,
    categories: catalog.categories.length,
    exactGroups: exactGroups.length,
    exactDuplicateCards: exactGroups.reduce((sum, group) => sum + group.length - 1, 0),
    semanticCandidates: annotatedCandidates.length,
    reviewedDistinctCandidates: annotatedCandidates.length - unreviewedCandidates.length,
    unreviewedSemanticCandidates: unreviewedCandidates.length,
    crossCategorySemanticCandidates: annotatedCandidates.filter((item) => !item.sameCategory).length,
  },
  exactGroups: exactGroups.map((group) => group.map(compactCard)),
  semanticCandidates: annotatedCandidates,
  unreviewedSemanticCandidates: unreviewedCandidates,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(JSON.stringify(report.summary, null, 2));
  for (const [index, candidate] of annotatedCandidates.slice(0, 40).entries()) {
    console.log(
      `${String(index + 1).padStart(2, "0")}. ${candidate.confidence.toFixed(3)} `
      + `${candidate.left.category}:${candidate.left.id} ↔ ${candidate.right.category}:${candidate.right.id}`
      + (candidate.reviewedDistinct ? " [reviewed distinct]" : ""),
    );
    console.log(`    ${candidate.left.question} — ${candidate.left.answer}`);
    console.log(`    ${candidate.right.question} — ${candidate.right.answer}`);
  }
}

if (process.argv.includes("--strict") && (exactGroups.length || unreviewedCandidates.length)) {
  if (exactGroups.length) {
    console.error(`Found ${exactGroups.length} exact duplicate group(s).`);
  }
  if (unreviewedCandidates.length) {
    console.error(`Found ${unreviewedCandidates.length} unreviewed semantic duplicate candidate(s).`);
    for (const candidate of unreviewedCandidates.slice(0, 20)) {
      console.error(`- ${candidate.left.id} ↔ ${candidate.right.id}`);
    }
  }
  process.exitCode = 1;
}
