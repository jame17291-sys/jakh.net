// Shared first-paint structure keeps the asynchronously loaded crossword from
// pushing the page below it down. The board scales with the available width.
export const CROSSWORD_COPY = {
  intro: ['Solve the clues to fill every white square. Select a clue, then type into the grid.', 'حلّ التعريفات لملء كل المربعات البيضاء. اختر تعريفاً ثم اكتب في الشبكة.'],
  how: ['How to play', 'طريقة اللعب'],
  instructions: ['Click a clue to change direction. Arrow keys move around the board; Enter switches across/down. Backspace clears a letter. You can paste letters into the selected word. Checking letters or revealing a word marks this puzzle as assisted. Arabic words are entered from right to left.', 'انقر تعريفاً لتغيير الاتجاه. تنقّل بمفاتيح الأسهم، واضغط Enter للتبديل بين الأفقي والرأسي. يمسح Backspace الحرف. يمكنك لصق حروف الكلمة المحددة. فحص الحروف أو كشف كلمة يسجّل استخدام المساعدة. تُكتب الكلمات العربية من اليمين إلى اليسار.'],
};
export function crosswordLoadingMarkup(game, lang = 'en') {
  const size = { mini: 5, midi: 9, crossword: 13 }[game];
  if (!size) return '';
  const pick = pair => pair[lang === 'ar' ? 1 : 0];
  return `<div class="pc-loading-shell"><p>${pick(CROSSWORD_COPY.intro)}</p><details><summary>${pick(CROSSWORD_COPY.how)}</summary><p>${pick(CROSSWORD_COPY.instructions)}</p></details><div class="pc-layout"><div><p class="pc-current" role="status">${pick(['Preparing your puzzle…', 'جارٍ إعداد اللغز…'])}</p><div class="pc-board pc-board-placeholder" data-size="${size}" aria-hidden="true"></div><div class="pc-tools" aria-hidden="true"><button type="button" disabled tabindex="-1">${pick(['Check letters', 'افحص الحروف'])}</button><button type="button" disabled tabindex="-1">${pick(['Reveal selected word', 'اكشف الكلمة المحددة'])}</button></div><p class="pc-status" aria-hidden="true"></p></div><div class="pc-clues" aria-hidden="true">${[['Across', 'أفقياً'], ['Down', 'رأسياً']].map(pair => `<div><h2>${pick(pair)}</h2><div class="pc-clue-placeholders"><span></span><span></span><span></span></div></div>`).join('')}</div></div></div>`;
}
