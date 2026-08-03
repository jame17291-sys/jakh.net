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
    const reviewedAt = typeof override.publishedAt === 'string'
      ? override.publishedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      ...card,
      question: override.question || card.question,
      answer: override.answer || card.answer,
      explanation: override.explanation || card.explanation,
      review: {
        status: 'reviewed',
        reviewedAt,
        reviewer: 'JAKH editorial team',
        sources: Array.isArray(override.sources) ? override.sources : [],
      },
    };
  });
}
