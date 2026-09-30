import { crosswordLoadingMarkup } from './puzzle-crossword-shell.js';
import { illustrationAttributes, gameIllustrationId } from './site-illustrations.js';
import { puzzleRoute, puzzleURL } from './puzzle-routes.js';
import { PUZZLES, BONUS, dayKey, seedFor, createProgressStore } from './puzzle-catalog.js';
import { DAILY_GAMES, ACTIVITY_KEY, requestedDay, dailyIndex, progressKey, resetCountdown, cleanActivity, recordCompletion, dailySummary, resultText, createSudokuProgress } from './puzzle-daily.js';

const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const t = (en,ar) => lang === 'ar' ? ar : en;
const pick = values => values[lang === 'ar' ? 1 : 0];
const initialTitle = document.title;
const library = document.getElementById('puzzle-library');
const stage = document.getElementById('puzzle-stage');
const mountPoint = document.getElementById('puzzle-mount');
const title = document.getElementById('puzzle-title');
const rest = [...document.querySelectorAll('[data-puzzle-directory]')];
let cleanup, generation=0, current, day=dayKey(), activeFilter='all', activeContext, activeState, storageUnavailable=false;
const progressStore=createProgressStore(()=>localStorage,storageNotice);
const verifiedResults=new Map();
const loadedStyles=new Map();
const modules = {
 word:()=>import('./puzzle-words.js'), hive:()=>import('./puzzle-words.js'), links:()=>import('./puzzle-words.js'), trails:()=>import('./puzzle-words.js'), 'letter-square':()=>import('./puzzle-words.js'),
 sudoku:()=>import('./puzzle-logic.js'),domino:()=>import('./puzzle-logic.js'),mosaic:()=>import('./puzzle-logic.js'),
 mini:()=>import('./puzzle-crossword.js'),midi:()=>import('./puzzle-crossword.js'),crossword:()=>import('./puzzle-crossword.js'),duel:()=>import('./puzzle-duel.js'),
};
function element(tag,text,className) {const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(className)e.className=className; return e;}
function href(game,variant) {return puzzleURL(game,lang,variant?{variant}:{});}
function stored(key) {return progressStore.read(key);}
function storageNotice() {
 storageUnavailable=true;document.getElementById('puzzle-storage-note').hidden=false;
 const note=document.getElementById('puzzle-daily-note'), text=t('Your browser cannot save progress right now. Progress and streaks will last only while this page stays open.','لا يستطيع المتصفح حفظ تقدّمك الآن. سيبقى التقدّم والسلاسل متاحين فقط ما دامت هذه الصفحة مفتوحة.');
 note.setAttribute('role','status');if(note.textContent!==text)note.textContent=text;
}
function activity() {return cleanActivity(stored(ACTIVITY_KEY));}
function renderDaily() {
 // Only engines award achievements after restoring and validating their board.
 // A stored completed flag alone is not evidence of a solve.
 const today=dayKey(), journal=activity();
 const summary=dailySummary(journal,lang,today), left=resetCountdown();
 document.getElementById('puzzle-today-date').textContent=new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-GB',{timeZone:'Asia/Dubai',dateStyle:'long'}).format(new Date());
 document.getElementById('puzzle-daily-completed').textContent=`${summary.completed.length} / ${summary.total}`;
 document.getElementById('puzzle-daily-streak').textContent=String(summary.current);
 document.getElementById('puzzle-daily-best').textContent=String(summary.best);
 document.getElementById('puzzle-daily-reset').textContent=t(`${left.hours}h ${String(left.minutes).padStart(2,'0')}m`,`${left.hours} س ${String(left.minutes).padStart(2,'0')} د`);
 if(storageUnavailable)storageNotice();else document.getElementById('puzzle-daily-note').textContent=summary.playedToday?t('Your streak is safe for today. Come back tomorrow for another puzzle.','سلسلتك محفوظة لليوم. عُد غداً إلى لغز جديد.'):t('Complete one of today’s puzzles to build your streak. Progress is saved on this device.','أكمل لغزاً من ألغاز اليوم لبناء سلسلتك. يُحفظ التقدّم على هذا الجهاز.');
 const next=['mini','word',...DAILY_GAMES.map(p=>p.id)].find(id=>!summary.completed.includes(id));
 const link=document.getElementById('puzzle-daily-next');
 link.href=next?href(next):href('bonus');
 link.textContent=next?t(`Play ${pick(PUZZLES.find(p=>p.id===next).title)}`,`العب ${pick(PUZZLES.find(p=>p.id===next).title)}`):t('All done! Explore bonus puzzles','أكملت الجميع! استكشف التحديات الإضافية');
}
function renderShare() {
 const box=document.getElementById('puzzle-share');
 box.hidden=!activeContext||!DAILY_GAMES.some(p=>p.id===activeContext.game);
 if(box.hidden)return;
 const finished=activeState?.completed===true||activeState?.finished===true;
 document.getElementById('puzzle-share-title').textContent=finished?t('A result worth sharing','نتيجة تستحق المشاركة'):t('Make it a friendly challenge','شارك التحدي مع صديق');
 document.getElementById('puzzle-share-copy').textContent=t('The date and result are included. The answers stay a secret.','تتضمّن المشاركة التاريخ والنتيجة، وتبقى الإجابات سرّاً.');
 document.getElementById('puzzle-share-clipboard').textContent=finished?t('Copy result','نسخ النتيجة'):t('Copy challenge','نسخ التحدي');
 document.getElementById('puzzle-share-native').hidden=typeof navigator.share!=='function';
 const text=resultText(activeContext,activeState||{},location.origin);
 document.getElementById('puzzle-share-whatsapp').href=`https://wa.me/?text=${encodeURIComponent(text)}`;
 document.getElementById('puzzle-share-text').value=text;
}
function manualShare(text) {
 document.getElementById('puzzle-share-fallback').hidden=false;
 const input=document.getElementById('puzzle-share-text');input.value=text;input.focus();input.select();
 document.getElementById('puzzle-share-status').textContent=t('Select and copy the text below.','حدّد النص أدناه وانسخه.');
}
function cssFor(game) {
 const file = ['word','hive','links','trails','letter-square'].includes(game)?'/puzzle-words.css':['sudoku','domino','mosaic'].includes(game)?'/puzzle-logic.css':game==='duel'?'/puzzle-duel.css':null;
 if(!file)return Promise.resolve();if(loadedStyles.has(file))return loadedStyles.get(file);
 const link=document.createElement('link');link.rel='stylesheet';link.href=file;
 const pending=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>{loadedStyles.delete(file);link.remove();reject(new Error('Puzzle styles could not load'));};});
 loadedStyles.set(file,pending);document.head.append(link);return pending;
}
function card(p,index,bonus=false) {
 const a=element('a',undefined,'puzzle-card');a.href=href(p.id,p.variant);a.dataset.puzzleLink='';a.dataset.category=p.category||'words';
 const top=element('div',undefined,'puzzle-card-top');top.append(element('span',String(index+1).padStart(2,'0')),element('span',p.tag?pick(p.tag):t('BONUS PUZZLE','تحدٍّ إضافي')));
 a.append(top);
 const art=illustrationAttributes(gameIllustrationId(p.id,p.variant),'game');
 if(art){const image=element('img');for(const [name,value] of Object.entries(art))image.setAttribute(name,value);a.append(image);}
 a.append(element('h3',pick(p.title)),element('p',pick(p.desc)));
 const bottom=element('div',undefined,'puzzle-card-bottom');bottom.append(element('span',p.id==='bonus'?t('Explore puzzles','استكشف التحديات'):t('Play now','العب الآن')));
 const key=progressKey(p.id,lang,day,p.variant), saved=stored(key);
 const complete=verifiedResults.get(key)===true||(!bonus&&dailySummary(activity(),lang,day).completed.includes(p.id));
 if(complete)bottom.append(element('span',t('✓ Completed','✓ مكتمل'),'puzzle-saved'));
 else if(saved)bottom.append(element('span',t('In progress','قيد اللعب'),'puzzle-saved'));
 else bottom.append(element('span',t('Free to play','مجانية')));
 a.append(bottom);return a;
}
function renderCards(filter=activeFilter) {
 day=dayKey();
 activeFilter=filter;
 const cards=document.getElementById('puzzle-cards');cards.replaceChildren(...PUZZLES.filter(p=>filter==='all'||p.category===filter).map((p)=>card(p,PUZZLES.indexOf(p))));
 renderDaily();
}
function showBonus() {
 mountPoint.append(element('p',t('Three original variations to explore at your own pace. These are a finite collection, available any time.','ثلاثة تنويعات أصلية تستكشفها على مهلك. مجموعة محدودة ومتاحة في أي وقت.')));
 const cards=element('div',undefined,'puzzle-cards');cards.append(...BONUS.map((p,i)=>card(p,i,true)));mountPoint.append(cards);
}
async function route({focus=false}={}) {
 const run=++generation;cleanup?.();cleanup=undefined;document.getElementById('puzzle-reset-confirm').hidden=true;
 activeContext=null;activeState=null;renderShare();document.getElementById('puzzle-share-status').textContent='';document.getElementById('puzzle-share-fallback').hidden=true;
 const params=new URLSearchParams(location.search),page=puzzleRoute(location.pathname),id=page?.id||params.get('game');
 current=PUZZLES.find(p=>p.id===id);
 mountPoint.className='puzzle-mount';mountPoint.removeAttribute('dir');
 library.hidden=!!current;rest.forEach(e=>e.hidden=!!current);stage.hidden=!current;
 const alternate=document.querySelector('.language-route-link');if(alternate)alternate.href=current?puzzleURL(current.id,lang==='ar'?'en':'ar',params):(lang==='ar'?'/play':'/ar/play/');
 if(!current){document.title=initialTitle;renderCards();if(focus)document.querySelector('.page-intro h1')?.focus();return;}
 day=requestedDay(params.get('date'));
 const variant=current.id==='links'&&params.get('variant')==='mini'?'mini':current.id==='word'&&params.get('variant')==='clue'?'clue':current.id==='mini'&&params.get('variant')==='starter'?'starter':'standard';
 const bonus=BONUS.find(b=>b.id===current.id&&b.variant===variant);
 const introArt=document.querySelector('[data-puzzle-editorial] .ra-art-topic');
 if(introArt){const art=illustrationAttributes(gameIllustrationId(current.id,bonus?.variant),'topic');if(art)for(const [name,value] of Object.entries(art))introArt.setAttribute(name,value);}
 title.textContent=pick(bonus?.title||current.title);document.title=page&&variant==='standard'?initialTitle:`${title.textContent} | ${t('Riddle Arabia','ريدل أرابيا')}`;
 document.getElementById('puzzle-reset').hidden=['bonus','duel'].includes(current.id);
 document.getElementById('puzzle-date').textContent=current.id==='duel'?t('Play together, wherever you are','العبا معاً أينما كنتما'):new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-GB',{timeZone:'Asia/Dubai',dateStyle:'long'}).format(new Date(`${day}T12:00:00+04:00`));
 document.getElementById('puzzle-history-note').hidden=['duel','bonus'].includes(current.id);
 mountPoint.replaceChildren();
 if(current.id==='bonus'){showBonus();if(focus)title.focus();return;}
 const game=current.id,puzzleDay=day,key=progressKey(game,lang,puzzleDay,variant);current.key=key;
 const sudoku=game==='sudoku'?createSudokuProgress(progressStore,key,params.get('difficulty')):null;
 function acceptResult(state){
  verifiedResults.set(key,state?.completed===true);
  if(state?.completed===true){const before=activity(),after=recordCompletion(before,{game,lang,date:puzzleDay,variant,assisted:state.assisted===true||state.hints>0||state.hintsUsed>0});if(JSON.stringify(before)!==JSON.stringify(after))progressStore.save(ACTIVITY_KEY,after);}
  if(run===generation){if(sudoku)context.difficulty=sudoku.difficulty;activeState=state;renderShare();}
 }
 const context={game,lang,variant,date:puzzleDay,difficulty:sudoku?.difficulty,puzzleId:`${puzzleDay}:${variant}`,puzzleIndex:dailyIndex(puzzleDay,game,variant),seed:seedFor(`${puzzleDay}:${game}:${variant}`),t,
  load(fallback){return sudoku?sudoku.read(fallback):stored(key)??structuredClone(fallback);},
  loadDifficulty(level){return sudoku?.select(level,{})||{};},
  save(state){
   if(sudoku)sudoku.save(state);else progressStore.save(key,state);
   acceptResult(state);
  },
  reportResult(state){if(JSON.stringify(stored(sudoku?sudoku.key:key))!==JSON.stringify(state))context.save(state);else acceptResult(state);},
  reset(){
   verifiedResults.delete(key);
   if(sudoku){const url=new URL(location.href);url.searchParams.set('difficulty',sudoku.difficulty);history.replaceState({},'',url);sudoku.reset();}
   else progressStore.reset(key);
  }
 };
 activeContext=context;
 document.getElementById('puzzle-history-note').textContent=puzzleDay===dayKey()?t('Progress and streaks stay on this device. The daily selection changes at midnight, Dubai time; this open puzzle will stay available.','يُحفظ التقدّم والسلاسل على هذا الجهاز. يتغير اختيار اليوم عند منتصف الليل بتوقيت دبي؛ ويبقى هذا اللغز المفتوح متاحاً.'):t('You are playing a shared puzzle from an earlier date. It does not change today’s streak.','تلعب لغزاً مشاركاً من تاريخ سابق. لا يغيّر سلسلة اليوم.');
 const loadingMarkup=crosswordLoadingMarkup(game,lang);
 if(loadingMarkup)mountPoint.innerHTML=loadingMarkup;
 else mountPoint.append(element('p',t('Preparing your puzzle…','جارٍ إعداد اللغز…'),'puzzle-loading'));
 mountPoint.setAttribute('aria-busy','true');
 try { const [module]=await Promise.all([modules[current.id](),cssFor(current.id)]);if(run!==generation)return;mountPoint.replaceChildren();cleanup=module.mount(mountPoint,context); }
 catch(error){if(run!==generation)return;mountPoint.replaceChildren(element('p',t('This game could not load. Please check your connection and try again.','تعذّر تحميل اللعبة. تحقّق من الاتصال ثم حاول مجدداً.')));const retry=element('button',t('Try again','حاول مجدداً'),'primary-btn');retry.onclick=()=>location.reload();mountPoint.append(retry);console.error('Puzzle load failed',error);}
 mountPoint.setAttribute('aria-busy','false');
 if(focus){title.focus();stage.scrollIntoView({block:'start',behavior:'instant'});}
}
// Clean game destinations use native navigation so document metadata, static
// instructions and the selected engine always come from the same page.
document.querySelectorAll('[data-puzzle-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-puzzle-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderCards(button.dataset.puzzleFilter);
}));
document.getElementById('puzzle-reset').onclick=()=>{document.getElementById('puzzle-reset-confirm').hidden=false;document.getElementById('puzzle-reset-cancel').focus();};
document.getElementById('puzzle-reset-cancel').onclick=()=>{document.getElementById('puzzle-reset-confirm').hidden=true;document.getElementById('puzzle-reset').focus();};
document.getElementById('puzzle-reset-yes').onclick=()=>{activeContext?.reset();route({focus:true});};
document.getElementById('puzzle-share-clipboard').onclick=async()=>{
 const text=resultText(activeContext,activeState||{},location.origin);
 try{await navigator.clipboard.writeText(text);document.getElementById('puzzle-share-status').textContent=t('Copied. Ready to share!','نُسخ النص، وأصبح جاهزاً للمشاركة!');}
 catch{manualShare(text);}
};
document.getElementById('puzzle-share-native').onclick=async()=>{
 const text=resultText(activeContext,activeState||{},location.origin);
 try{await navigator.share({text});}catch(error){if(error.name!=='AbortError')manualShare(text);}
};
window.addEventListener('storage',event=>{if(event.key){progressStore.invalidate(event.key);verifiedResults.delete(event.key);if(!current)renderCards();}});
function refreshDay(){if(document.hidden)return;if(!current){if(day!==dayKey())renderCards();else renderDaily();}}
document.addEventListener('visibilitychange',refreshDay);
setInterval(refreshDay,30000);
window.addEventListener('popstate',()=>route({focus:true}));
// Keep an in-progress board stable across midnight; the next game uses the new day.
route();
