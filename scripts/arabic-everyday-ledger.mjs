// Restores the wording recorded before the 2026-10-21 everyday-Arabic rewrite,
// so older content ledgers can keep verifying their whole-card fingerprints.
export function beforeArabicRewrite(card, change) {
  const restored = structuredClone(card);
  restored.question.ar = change.previous.questionAr;
  if (change.previous.tvQuizContentKey) restored.tvQuiz.contentKey = change.previous.tvQuizContentKey;
  return restored;
}
