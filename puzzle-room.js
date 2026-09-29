import { PUZZLES, BONUS, dayKey, seedFor, storageKey } from './puzzle-catalog.js';

const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const t = (en,ar) => lang === 'ar' ? ar : en;
const pick = values => values[lang === 'ar' ? 1 : 0];
const base = lang === 'ar' ? '/ar/play/' : '/play';
const library = document.getElementById('puzzle-library');
const stage = document.getElementById('puzzle-stage');
const mountPoint = document.getElementById('puzzle-mount');
const title = document.getElementById('puzzle-title');
const rest = [...document.querySelectorAll('[data-puzzle-directory]')];
let cleanup, generation=0, current, day=dayKey(), activeFilter='all';
const loadedStyles=new Map();
const modules = {
 word:()=>import('./puzzle-words.js'), hive:()=>import('./puzzle-words.js'), links:()=>import('./puzzle-words.js'), trails:()=>import('./puzzle-words.js'), 'letter-square':()=>import('./puzzle-words.js'),
 sudoku:()=>import('./puzzle-logic.js'),domino:()=>import('./puzzle-logic.js'),mosaic:()=>import('./puzzle-logic.js'),
 mini:()=>import('./puzzle-crossword.js'),midi:()=>import('./puzzle-crossword.js'),crossword:()=>import('./puzzle-crossword.js'),duel:()=>import('./puzzle-duel.js'),
};
function element(tag,text,className) {const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(className)e.className=className; return e;}
function href(game,variant) {const p=new URLSearchParams({game});if(variant)p.set('variant',variant);return `${base}?${p}`;}
function stored(key) {try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function storageNotice() {document.getElementById('puzzle-storage-note').hidden=false;}
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
 a.append(top,element('h3',pick(p.title)),element('p',pick(p.desc)));
 const bottom=element('div',undefined,'puzzle-card-bottom');bottom.append(element('span',p.id==='bonus'?t('Explore puzzles','استكشف التحديات'):t('Play now','العب الآن')));
 if(stored(storageKey(p.id,lang,day,p.variant)))bottom.append(element('span',t('Progress saved','تقدّم محفوظ'),'puzzle-saved'));
 else bottom.append(element('span',t('Free to play','مجانية')));
 a.append(bottom);return a;
}
function renderCards(filter=activeFilter) {
 activeFilter=filter;
 const cards=document.getElementById('puzzle-cards');cards.replaceChildren(...PUZZLES.filter(p=>filter==='all'||p.category===filter).map((p)=>card(p,PUZZLES.indexOf(p))));
}
function showBonus() {
 mountPoint.append(element('p',t('Three original variations to explore at your own pace. These are a finite collection, available any time.','ثلاثة تنويعات أصلية تستكشفها على مهلك. مجموعة محدودة ومتاحة في أي وقت.')));
 const cards=element('div',undefined,'puzzle-cards');cards.append(...BONUS.map((p,i)=>card(p,i,true)));mountPoint.append(cards);
}
async function route({focus=false}={}) {
 const run=++generation;cleanup?.();cleanup=undefined;document.getElementById('puzzle-reset-confirm').hidden=true;
 const params=new URLSearchParams(location.search),id=params.get('game');
 current=PUZZLES.find(p=>p.id===id);
 mountPoint.className='puzzle-mount';mountPoint.removeAttribute('dir');
 library.hidden=!!current;rest.forEach(e=>e.hidden=!!current);stage.hidden=!current;
 const alternate=document.querySelector('.language-route-link');if(alternate)alternate.href=`${lang==='ar'?'/play':'/ar/play/'}${current?`?${params}`:''}`;
 if(!current){document.title=t('Free Browser Games | Riddle Arabia','ألعاب متصفح مجانية | ريدل أرابيا');renderCards();if(focus)document.querySelector('.page-intro h1')?.focus();return;}
 day=dayKey();
 const variant=current.id==='links'&&params.get('variant')==='mini'?'mini':current.id==='word'&&params.get('variant')==='clue'?'clue':current.id==='mini'&&params.get('variant')==='starter'?'starter':'standard';
 const bonus=BONUS.find(b=>b.id===current.id&&b.variant===variant);
 title.textContent=pick(bonus?.title||current.title);document.title=`${title.textContent} | ${t('Riddle Arabia','ريدل أرابيا')}`;
 document.getElementById('puzzle-reset').hidden=['bonus','duel'].includes(current.id);
 document.getElementById('puzzle-date').textContent=current.id==='duel'?t('Play together, wherever you are','العبا معاً أينما كنتما'):new Intl.DateTimeFormat(lang==='ar'?'ar-AE':'en-GB',{timeZone:'Asia/Dubai',dateStyle:'long'}).format(new Date());
 document.getElementById('puzzle-history-note').hidden=['duel','bonus'].includes(current.id);
 mountPoint.replaceChildren();
 if(current.id==='bonus'){showBonus();if(focus)title.focus();return;}
 const key=storageKey(current.id,lang,day,variant);current.key=key;
 const context={game:current.id,lang,variant,puzzleId:`${day}:${variant}`,seed:seedFor(`${day}:${current.id}:${variant}`),t,
  load(fallback){return stored(key)??structuredClone(fallback);},
  save(state){try{localStorage.setItem(key,JSON.stringify(state));}catch{storageNotice();}}
 };
 mountPoint.append(element('p',t('Preparing your puzzle…','جارٍ إعداد اللغز…'),'puzzle-loading'));
 try { const [module]=await Promise.all([modules[current.id](),cssFor(current.id)]);if(run!==generation)return;mountPoint.replaceChildren();cleanup=module.mount(mountPoint,context); }
 catch(error){if(run!==generation)return;mountPoint.replaceChildren(element('p',t('This game could not load. Please check your connection and try again.','تعذّر تحميل اللعبة. تحقّق من الاتصال ثم حاول مجدداً.')));const retry=element('button',t('Try again','حاول مجدداً'),'primary-btn');retry.onclick=()=>route();mountPoint.append(retry);console.error('Puzzle load failed',error);}
 if(focus){title.focus();stage.scrollIntoView({block:'start',behavior:'instant'});}
}
document.addEventListener('click',event=>{
 const a=event.target.closest('a[data-puzzle-link]');if(!a||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
 event.preventDefault();history.pushState({},'',a.href);route({focus:true});
});
document.querySelectorAll('[data-puzzle-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-puzzle-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderCards(button.dataset.puzzleFilter);
}));
document.getElementById('puzzle-reset').onclick=()=>{document.getElementById('puzzle-reset-confirm').hidden=false;document.getElementById('puzzle-reset-cancel').focus();};
document.getElementById('puzzle-reset-cancel').onclick=()=>{document.getElementById('puzzle-reset-confirm').hidden=true;document.getElementById('puzzle-reset').focus();};
document.getElementById('puzzle-reset-yes').onclick=()=>{try{localStorage.removeItem(current.key);}catch{storageNotice();}route({focus:true});};
window.addEventListener('popstate',()=>route({focus:true}));
// Keep an in-progress board stable across midnight; the next game uses the new day.
route();
