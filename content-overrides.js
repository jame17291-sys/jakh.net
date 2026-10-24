// Cards come from the deployed static JSON; published Content Studio revisions
// only refine their wording. A slow or hanging API must never keep a topic
// page or Shuffle Challenge empty, so stop waiting after this long and show the
// deployed wording. The request itself is not aborted, so a late answer still
// leaves the API status unchanged.
export const CONTENT_OVERRIDE_WAIT_MS = 2500;

export async function loadPublishedContentOverrides(apiFetch, categorySlug, { timeoutMs = CONTENT_OVERRIDE_WAIT_MS } = {}) {
  let timer;
  const request = Promise.resolve()
    .then(() => apiFetch(`/content/questions?category=${encodeURIComponent(categorySlug)}`))
    .then((response) => (Array.isArray(response?.overrides) ? response.overrides : []))
    .catch(() => []);
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve([]), timeoutMs);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function mergePublishedContentOverrides(cards, overrides) {
  if (!Array.isArray(cards) || !Array.isArray(overrides) || !overrides.length) return cards;
  const byId = new Map(overrides
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => [item.id, item]));
  return cards.map((card) => {
    const override = byId.get(card.id);
    if (!override) return card;
    const merged = {
      ...card,
      question: override.question || card.question,
      answer: override.answer || card.answer,
      // Published revisions are complete snapshots, not partial patches.
      explanation: override.explanation,
    };
    // Authored choices and their rationale belong to the exact source wording.
    // Content Studio does not publish replacement choice sets yet, so a changed
    // question, answer, or explanation must fall back to ordinary practice.
    if (['question', 'answer', 'explanation'].some((field) =>
      ['en', 'ar'].some((language) => merged[field]?.[language] !== card[field]?.[language]))) {
      delete merged.quickFire;
    }
    if (['question', 'answer'].some((field) =>
      ['en', 'ar'].some((language) => merged[field]?.[language] !== card[field]?.[language]))) {
      delete merged.acceptedAnswers;
    }
    return merged;
  });
}
