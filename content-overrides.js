export async function loadPublishedContentOverrides(apiFetch, categorySlug) {
  try {
    const response = await apiFetch(`/content/questions?category=${encodeURIComponent(categorySlug)}`);
    return Array.isArray(response?.overrides) ? response.overrides : [];
  } catch (_) {
    return [];
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
