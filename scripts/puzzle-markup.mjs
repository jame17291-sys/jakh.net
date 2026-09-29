import { PUZZLES } from '../puzzle-catalog.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function puzzleMarkup(lang='en') {
 const t=(en,ar)=>lang==='ar'?ar:en,p=a=>a[lang==='ar'?1:0],base=lang==='ar'?'/ar/play/':'/play';
 return `<!-- puzzle-room:start -->
      <section class="shell puzzle-library" id="puzzle-library" aria-labelledby="puzzle-library-title">
        <div class="puzzle-section-head"><div><p class="eyebrow">${t('WORDS, PATTERNS & A LITTLE CURIOSITY','كلمات وأنماط وقليل من الفضول')}</p><h2 id="puzzle-library-title">${t('Find your next favourite.','اكتشف لعبتك المفضلة.')}</h2><p>${t('A puzzle for a quiet moment, a fresh perspective, or a friendly challenge.','لغز للحظات الهادئة أو لاكتشاف فكرة جديدة أو لتحدٍّ مع صديق.')}</p></div></div>
        <div class="puzzle-filters" role="group" aria-label="${t('Filter games','تصفية الألعاب')}">${[['all','All games','كل الألعاب'],['words','Word games','ألعاب الكلمات'],['logic','Logic & patterns','منطق وأنماط'],['friends','With a friend','مع صديق']].map(([id,en,ar])=>`<button type="button" data-puzzle-filter="${id}" aria-pressed="${id==='all'}">${t(en,ar)}</button>`).join('')}</div>
        <div class="puzzle-cards" id="puzzle-cards">${PUZZLES.map((game,i)=>`<a class="puzzle-card" href="${base}?game=${game.id}" data-puzzle-link data-category="${game.category}"><div class="puzzle-card-top"><span>${String(i+1).padStart(2,'0')}</span><span>${esc(p(game.tag))}</span></div><h3>${esc(p(game.title))}</h3><p>${esc(p(game.desc))}</p><div class="puzzle-card-bottom"><span>${game.id==='bonus'?t('Explore puzzles','استكشف التحديات'):t('Play now','العب الآن')}</span><span>${t('Free to play','مجانية')}</span></div></a>`).join('\n')}</div>
        <p class="puzzle-fineprint">${t('Original Riddle Arabia puzzles. Word games rotate through a finite curated collection; logic games use generated boards. Your progress is saved on this device. Online Word Duel connects you with a friend.','ألغاز أصلية من ريدل أرابيا. تتناوب ألعاب الكلمات ضمن مجموعة محدودة ومختارة، وتستخدم ألعاب المنطق لوحات مولّدة. يُحفظ تقدّمك على هذا الجهاز، وتتيح مبارزة الكلمات اللعب مع صديق عبر الإنترنت.')}</p>
        <noscript><p>${t('Enable JavaScript to open and play these puzzles.','فعّل JavaScript لفتح هذه الألغاز ولعبها.')}</p></noscript>
      </section>
      <section class="shell puzzle-stage" id="puzzle-stage" aria-labelledby="puzzle-title" hidden>
        <div class="puzzle-stage-top"><a class="puzzle-back" href="${base}" data-puzzle-link>${t('Back to all games','العودة إلى جميع الألعاب')}</a><span class="puzzle-date" id="puzzle-date"></span></div>
        <div class="puzzle-frame"><div class="puzzle-title-row"><h1 id="puzzle-title" tabindex="-1"></h1><button type="button" class="puzzle-reset" id="puzzle-reset">${t('Start over','ابدأ من جديد')}</button></div>
        <div class="puzzle-reset-confirm" id="puzzle-reset-confirm" hidden><p>${t('Clear your progress for this puzzle and start again?','هل تريد مسح تقدّمك في هذا اللغز والبدء مجدداً؟')}</p><button type="button" class="primary-btn" id="puzzle-reset-yes">${t('Start again','ابدأ مجدداً')}</button><button type="button" class="ghost-btn" id="puzzle-reset-cancel">${t('Keep playing','واصل اللعب')}</button></div>
        <p id="puzzle-storage-note" class="puzzle-storage-note" role="status" hidden>${t('Your browser cannot save progress right now. Progress will last only while this page stays open.','لا يستطيع المتصفح حفظ تقدّمك الآن. سيبقى تقدّمك متاحاً فقط ما دامت هذه الصفحة مفتوحة.')}</p>
        <div class="puzzle-mount" id="puzzle-mount"></div>
        <p class="puzzle-history-note" id="puzzle-history-note">${t('Your progress stays on this device. The collection rotates at midnight, Dubai time; an open puzzle stays available until you leave it.','يُحفظ تقدّمك على هذا الجهاز. تتناوب الألغاز عند منتصف الليل بتوقيت دبي؛ ويبقى اللغز المفتوح متاحاً حتى تغادره.')}</p></div>
      </section>
<!-- puzzle-room:end -->`;
}
