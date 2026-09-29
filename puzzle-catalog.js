export const PUZZLES = [
  {id:'bonus',title:['Bonus puzzles','تحديات إضافية'],category:'collection',desc:['Small twists on familiar favourites. Explore three extra challenges.','تنويعات جديدة على ألعابك المفضلة. استكشف ثلاثة تحديات إضافية.'],tag:['A little different','تحديات متنوعة']},
  {id:'duel',title:['Word Duel','مبارزة الكلمات'],category:'friends',desc:['Build words on a shared board. Invite a friend and take turns online.','كوّن كلمات على لوحة مشتركة. ادعُ صديقاً وتبادلا الأدوار عبر الإنترنت.'],tag:['2 players · online','لاعبان · عبر الإنترنت']},
  {id:'crossword',title:['The Crossword','الكلمات المتقاطعة'],category:'words',desc:['Settle in with an original, interlocking collection of clues.','استمتع بمجموعة أصلية من التعريفات والكلمات المتشابكة.'],tag:['Take your time','على مهلك']},
  {id:'midi',title:['The Midi','المتقاطعة المتوسطة'],category:'words',desc:['A medium-sized crossword for a satisfying little break.','كلمات متقاطعة بحجم متوسط لاستراحة ممتعة.'],tag:['A little longer','تحدٍّ متوسط']},
  {id:'mini',title:['The Mini','المتقاطعة المصغّرة'],category:'words',desc:['A handful of clues. One small grid. Find your way across and down.','تعريفات قليلة وشبكة صغيرة. اكتشف الكلمات أفقياً ورأسياً.'],tag:['A quick break','استراحة سريعة']},
  {id:'hive',title:['Word Hive','خلية الحروف'],category:'words',desc:['Make words from seven letters. Keep the centre letter in every word.','كوّن كلمات من سبعة حروف، مع استخدام حرف الوسط في كل كلمة.'],tag:['Find every word','اكتشف كل الكلمات']},
  {id:'word',title:['Five Letters','خمسة حروف'],category:'words',desc:['Find the hidden five-letter word in six guesses. Every guess gives a clue.','اكتشف الكلمة ذات الحروف الخمسة في ست محاولات. كل محاولة تمنحك دليلاً.'],tag:['6 guesses','٦ محاولات']},
  {id:'domino',title:['Logic Dominoes','دومينو المنطق'],category:'logic',desc:['Fit the dominoes. Make every region follow its own rule.','رتّب قطع الدومينو وحقّق شرط كل منطقة.'],tag:['Numbers & logic','أرقام ومنطق']},
  {id:'trails',title:['Word Trails','خيوط الكلمات'],category:'words',desc:['Follow the theme through a grid of letters. Leave no letter behind.','تتبّع كلمات الموضوع عبر شبكة الحروف، واستخدم كل حرف.'],tag:['Find the theme','اكتشف الموضوع']},
  {id:'links',title:['Connections','روابط'],category:'words',desc:['Sixteen words. Four hidden groups. Discover what belongs together.','ست عشرة كلمة وأربع مجموعات مخفية. اكتشف الرابط بينها.'],tag:['4 groups','٤ مجموعات']},
  {id:'mosaic',title:['Mosaic','زخارف'],category:'logic',desc:['Match shared layers and clear the board, one thoughtful pair at a time.','طابق الطبقات المشتركة وأفرغ اللوحة، زوجاً بعد زوج.'],tag:['Match & unwind','طابق واسترخِ']},
  {id:'letter-square',title:['Letter Square','مربّع الحروف'],category:'words',desc:['Connect letters around the square. Link words to use every letter.','صِل الحروف حول المربّع واربط الكلمات لاستخدام جميع الحروف.'],tag:['Connect the letters','صِل الحروف']},
  {id:'sudoku',title:['Sudoku','سودوكو'],category:'logic',desc:['Complete the grid with numbers 1–9. Three levels, one clear solution.','أكمل الشبكة بالأرقام من ١ إلى ٩. ثلاثة مستويات وحل واحد واضح.'],tag:['3 difficulties','٣ مستويات']},
];
export const BONUS = [
 {id:'links',variant:'mini',title:['Mini Connections','روابط مصغّرة'],desc:['Nine words, three groups. A smaller grouping challenge.','تسع كلمات وثلاث مجموعات في تحدٍّ مصغّر.']},
 {id:'word',variant:'clue',title:['A Helpful Letter','حرف مساعد'],desc:['Start with one letter revealed, then find the word.','ابدأ بحرف مكشوف، ثم اكتشف الكلمة.']},
 {id:'mini',variant:'starter',title:['A Head Start','بداية مساعدة'],desc:['A mini crossword with the first letter of each answer filled in.','متقاطعة مصغّرة مع كشف الحرف الأول من كل إجابة.']},
];
export function dayKey(date = new Date()) {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export function seedFor(value) { let seed=2166136261; for(const c of value) seed=Math.imul(seed^c.charCodeAt(0),16777619); return seed>>>0; }
export function storageKey(game,lang,day,variant='standard') { return `ra-puzzles-v1:${game==='duel'?'shared':lang}:${game}:${game==='duel'?'room':day}:${variant}`; }

// Keep a page-local copy even when browser persistence is unavailable. A null
// entry is an intentional reset, so failed deletion cannot restore old progress.
export function createProgressStore(storageProvider, onUnavailable=()=>{}) {
 const memory=new Map();
 const clone=value=>structuredClone(value);
 return {
  read(key) {
   if(memory.has(key))return clone(memory.get(key));
   let text;
   try{text=storageProvider().getItem(key);}catch{onUnavailable();return null;}
   let value=null;
   if(text!==null)try{value=JSON.parse(text);}catch{/* Invalid saved data starts fresh. */}
   memory.set(key,clone(value));return clone(value);
  },
  save(key,value) {
   const snapshot=clone(value);memory.set(key,snapshot);
   try{storageProvider().setItem(key,JSON.stringify(snapshot));}catch{onUnavailable();}
  },
  reset(key) {
   memory.set(key,null);
   try{storageProvider().removeItem(key);}catch{onUnavailable();}
  },
 };
}
