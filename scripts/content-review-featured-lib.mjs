/** Structural safeguards for Riddle Arabia's curated SEO selections.
 * These checks deliberately do not determine factual correctness or review
 * status; evidence and bilingual approval remain separate editorial work.
 */
export function inspectFeaturedCollections(pages, cardsByCategory, policy) {
  const errors = [];
  const holds = new Map();
  for (const hold of policy.holds || []) {
    if (!hold?.id || !hold?.reason?.trim()) {
      errors.push("Every featured-selection hold needs an ID and a reason.");
      continue;
    }
    holds.set(hold.id, hold.reason);
  }

  let cardCount = 0;
  const selectedPages = pages.filter((page) => page.kind !== "games");
  for (const page of selectedPages) {
    const rule = policy.collections?.[page.key];
    if (!rule) {
      errors.push(`${page.key}: add an editorial policy before featuring this collection.`);
      continue;
    }
    if (!Array.isArray(page.cards) || page.cards.length !== rule.cardCount) {
      errors.push(`${page.key}: expected ${rule.cardCount} selected cards, found ${page.cards?.length ?? 0}.`);
      continue;
    }
    const seen = new Set();
    const categories = new Set();
    const subcategories = new Set();
    for (const reference of page.cards) {
      const [slug, id] = Array.isArray(reference) ? reference : [];
      const label = `${page.key}/${id || "unknown"}`;
      cardCount += 1;
      if (!slug || !id) {
        errors.push(`${label}: invalid selection reference.`);
        continue;
      }
      if (seen.has(id)) errors.push(`${label}: duplicate selection.`);
      seen.add(id);
      if (holds.has(id)) errors.push(`${label}: unresolved editorial hold.`);
      if (rule.sourceCategories && !rule.sourceCategories.includes(slug)) {
        errors.push(`${label}: source category is not declared by the policy.`);
      }
      const card = cardsByCategory[slug]?.find((candidate) => candidate.id === id);
      if (!card) {
        errors.push(`${label}: source card is missing.`);
        continue;
      }
      categories.add(slug);
      subcategories.add(`${slug}/${card.subcategory?.en || ""}`);
      for (const language of ["en", "ar"]) {
        for (const field of ["question", "answer"]) {
          if (!card[field]?.[language]?.trim()) errors.push(`${label}: missing ${language} ${field}.`);
        }
        if (rule.requireSubcategoryInQuestion) {
          const subject = card.subcategory?.[language];
          if (!subject || !card.question?.[language]?.includes(subject)) {
            errors.push(`${label}: ${language} question must name its series outside its category page.`);
          }
        }
      }
    }
    if (categories.size < (rule.minSourceCategories || 1)) {
      errors.push(`${page.key}: topic coverage fell below ${rule.minSourceCategories} source categories.`);
    }
    if (subcategories.size < (rule.minSubcategories || 1)) {
      errors.push(`${page.key}: coverage fell below ${rule.minSubcategories} subtopics.`);
    }
  }
  return { errors, collectionCount: selectedPages.length, cardCount };
}
