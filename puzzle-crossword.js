import { CROSSWORD_COPY } from './puzzle-crossword-shell.js';
// Original Riddle Arabia clue bank. No newspaper grids or syndicated content.
export const CLUES = {
 en: [
 ['SAND','Tiny grains beneath your feet at the beach'],['PALM','A tree with fronds, or the inside of a hand'],['NILE','River that flows through Egypt'],['MOON','Earth’s natural satellite'],['STAR','A point of light in the night sky'],['DATE','A sweet fruit that grows on a palm'],['BOOK','A story bound between covers'],['RAIN','Water falling from a cloud'],['SHIP','A large vessel at sea'],['LAMP','A light on a bedside table'],['ROAD','A route for cars'],['DUNE','A hill shaped by windblown sand'],['PEAR','A fruit often wider at the bottom'],['ROSE','A flower with thorns'],['SEED','The beginning of many plants'],['LION','A big cat with a mane'],['LIME','A small green citrus fruit'],['MINT','A fragrant herb used in tea'],['TIME','What a clock measures'],['NOTE','A short written message'],['TREE','A plant with a woody trunk'],['BIRD','A feathered animal'],['HOME','The place where you live'],['MAP','A drawing that helps you find your way'],['SEA','A large body of salt water'],['SUN','The star at the centre of our solar system'],['TEA','A drink made by steeping leaves'],['PEN','A tool that writes in ink'],['OWL','A bird often associated with wisdom'],['CAT','A pet that purrs'],['OASIS','A place with water in a desert'],['CAMEL','A desert animal with one or two humps'],['PEARL','A gem that can form inside an oyster'],['CORAL','A reef-building marine animal'],['OLIVE','A small fruit pressed to make oil'],['RIVER','A stream of water flowing towards a sea or lake'],['OCEAN','One of Earth’s largest bodies of water'],['TRAIL','A path for walking'],['STONE','A small piece of rock'],['LIGHT','What lets you see in the dark'],['CLOUD','A visible mass of droplets in the sky'],['TRAIN','Linked carriages travelling on rails'],['BREAD','Food made from flour and baked'],['NORTH','The direction opposite south'],['SOUTH','The direction opposite north'],['EAST','The direction where the sun rises'],['WEST','The direction where the sun sets'],['EARTH','The planet we call home'],['GARDEN','A place where flowers or vegetables are grown'],['ISLAND','Land surrounded by water'],['DESERT','A landscape with very little rain'],['MARKET','A place where goods are bought and sold'],['ORANGE','A citrus fruit and a colour'],['SILVER','A precious metal with symbol Ag'],['COFFEE','A drink brewed from roasted beans'],['SCHOOL','A place where students learn'],['BRIDGE','A structure spanning a river or road'],['WINDOW','An opening that lets light into a room'],['PLANET','A large body orbiting a star'],['TRAVEL','Go from one place to another'],['PENCIL','A writing tool with a graphite core'],['CIRCLE','A round shape with no corners'],['FOREST','A large area covered with trees'],['LANTERN','A portable light with a protective case'],['COMPASS','A tool with a needle that points north'],['LIBRARY','A place where you can borrow books'],['JOURNEY','A trip from one place to another'],['PATTERN','A repeated design'],['MOUNTAIN','A very high natural rise in the land'],['HORIZON','The line where land or sea seems to meet the sky'],['FALCON','A swift bird of prey'],['ANCIENT','Belonging to the very distant past'],['HISTORY','The study of past events'],['CULTURE','The shared arts and customs of a community'],['LANGUAGE','A system of words used to communicate'],['TREASURE','A collection of valuable objects'],['SUNRISE','The beginning of daylight'],['SHELTER','Protection from weather or danger'],['PATIENCE','The ability to wait calmly'],['CURIOUS','Eager to learn or discover'],
 ],
 ar: [
 ['رمل','حبيبات صغيرة تغطي الشاطئ'],['نخل','شجر يثمر التمر'],['قمر','التابع الطبيعي للأرض'],['شمس','النجم الذي يضيء نهارنا'],['بحر','مسطح واسع من الماء المالح'],['نهر','مجرى ماء عذب'],['جبل','ارتفاع طبيعي كبير في الأرض'],['كتاب','صفحات مجمّعة بين غلافين'],['قلم','أداة للكتابة بالحبر'],['تمر','ثمر النخيل'],['ورد','أزهار عطرة ذات أشواك'],['باب','مدخل يُفتح ويُغلق'],['بيت','مكان السكن'],['ليل','الفترة بين الغروب والشروق'],['نهار','الفترة المضيئة من اليوم'],['مطر','ماء ينزل من السحاب'],['نور','ما يساعد العين على الرؤية'],['حجر','قطعة من الصخر'],['حلم','ما قد تراه أثناء النوم'],['سفر','الانتقال إلى مكان بعيد'],['علم','معرفة منظّمة تُكتسب بالدراسة'],['درس','جزء من مادة يتعلّمها الطالب'],['نجم','جرم مضيء يظهر في السماء'],['وقت','ما تقيسه الساعة'],['طين','تراب ممزوج بالماء'],['عسل','مادة حلوة ينتجها النحل'],['قلب','عضو يضخ الدم'],['شجر','نبات ذو جذع وأغصان'],['سوق','مكان بيع السلع وشرائها'],['فجر','بداية ضوء الصباح'],['جسر','بناء يصل بين ضفتين'],['ملح','مادة بيضاء تُضاف إلى الطعام'],['موج','حركة مرتفعة على سطح البحر'],['صقر','طائر جارح سريع'],['جمل','حيوان صحراوي ذو سنام'],['نسر','طائر جارح كبير'],['قطار','عربات تسير على سكة'],['طريق','مسار للمرور والسفر'],['قارب','مركب صغير في الماء'],['سحاب','تجمّع قطرات الماء في السماء'],['نجوم','جمع نجم'],['رمان','فاكهة ذات حبوب حمراء كثيرة'],['زيتون','ثمر يُعصر لاستخراج الزيت'],['نخلة','شجرة واحدة تثمر التمر'],['كوكب','جرم كبير يدور حول نجم'],['مفتاح','أداة لفتح القفل'],['مصباح','جهاز يصدر الضوء'],['حديقة','مكان تزرع فيه الأزهار والأشجار'],['جزيرة','أرض يحيط بها الماء'],['مدرسة','مكان يتعلّم فيه التلاميذ'],['مكتبة','مكان لحفظ الكتب وقراءتها'],['مدينة','تجمّع سكاني كبير'],['نافذة','فتحة في الجدار يدخل منها الضوء'],['سفينة','مركب كبير في البحر'],['قهوة','مشروب يُحضّر من البن'],['صحراء','منطقة قليلة المطر'],['خريطة','رسم يوضّح مواقع الأماكن'],['تاريخ','دراسة أحداث الماضي'],['ثقافة','معارف المجتمع وفنونه وعاداته'],['معرفة','حصيلة ما نتعلّمه'],['حروف','منها تتكوّن الكلمات'],['كلمات','وحدات تعبّر عن المعاني في اللغة'],['حكاية','قصة تُروى'],['رواية','عمل أدبي سردي طويل'],['صداقة','علاقة ود بين الأشخاص'],['بستان','أرض مزروعة بأشجار مثمرة'],['برتقال','فاكهة حمضية ذات قشرة برتقالية'],['بوصلة','أداة تحدّد الاتجاهات'],['فراشة','حشرة ذات جناحين ملوّنين'],['مغامرة','تجربة تتضمن تحدياً واكتشافاً'],['مسافر','شخص ينتقل إلى مكان بعيد'],['مسافة','البعد بين نقطتين'],['طبيعة','عالم النباتات والحيوانات والبيئة'],['فضول','رغبة في المعرفة والاكتشاف'],
 ]
};
export function normalizeLetter(value) {return (typeof value==='string'?value:'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/gu,'').toUpperCase();}
function inputLetters(value,lang) {return normalizeLetter(value).replace(lang==='ar'?/[^\u0621-\u064A]/gu:/[^A-Z]/gu,'');}
function random(seed) {let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
function buildCrossword(size,lang='en',seed=1) {
 const rng=random(seed),grid=Array(size*size).fill(''),directions=Array.from({length:size*size},()=>new Set()),entries=[];
 const words=CLUES[lang].filter(([w])=>w.length<=size).map(([word,clue])=>({word,clue,tie:rng()}));
 words.sort((a,b)=>b.word.length-a.word.length||a.tie-b.tie);
 const first=words.splice(0,1)[0];
 function place(item,r,c,d) {const indices=[...item.word].map((_,i)=>(r+(d==='down'?i:0))*size+c+(d==='across'?i:0));indices.forEach((index,i)=>{grid[index]=item.word[i];directions[index].add(d);});entries.push({...item,r,c,d,indices});}
 place(first,Math.floor(size/2),Math.floor((size-first.word.length)/2),'across');
 function valid(item,r,c,d){
  const dr=d==='down'?1:0,dc=1-dr,er=r+dr*(item.word.length-1),ec=c+dc*(item.word.length-1);
  if(r<0||c<0||er>=size||ec>=size)return -1;
  const at=(y,x)=>y>=0&&x>=0&&y<size&&x<size?grid[y*size+x]:'';
  if(at(r-dr,c-dc)||at(er+dr,ec+dc))return -1;
  let crosses=0;
  for(let i=0;i<item.word.length;i++){const y=r+dr*i,x=c+dc*i,idx=y*size+x;
   if(grid[idx]){if(grid[idx]!==item.word[i]||directions[idx].has(d))return -1;crosses++;}
   else if(at(y+dc,x+dr)||at(y-dc,x-dr))return -1;
  }
  return crosses;
 }
 let moved=true;
 while(moved){moved=false;
  for(let wi=0;wi<words.length;wi++) {const item=words[wi];let best=null;
   for(let i=0;i<grid.length;i++){if(!grid[i])continue;for(let j=0;j<item.word.length;j++){if(item.word[j]!==grid[i])continue;for(const d of ['across','down']){
    const r=Math.floor(i/size)-(d==='down'?j:0),c=i%size-(d==='across'?j:0),crosses=valid(item,r,c,d);
    if(crosses>0){const score=crosses*100+rng();if(!best||score>best.score)best={r,c,d,score};}
   }}}
   if(best){place(item,best.r,best.c,best.d);words.splice(wi--,1);moved=true;}
  }
 }
 const starts=[...new Set(entries.map(e=>e.indices[0]))].sort((a,b)=>a-b);
 entries.forEach((e,i)=>{e.number=starts.indexOf(e.indices[0])+1;e.id=i;});
 return {size,lang,grid,entries};
}
export function makeCrossword(size,lang='en',seed=1) {
 if(![5,9,13].includes(size))throw new RangeError('Crossword size must be 5, 9 or 13');
 if(!Object.hasOwn(CLUES,lang))throw new RangeError('Crossword language must be en or ar');
 seed=Number.isFinite(seed)?seed>>>0:1;
 let best;const target={5:4,9:9,13:17}[size];
 for(let attempt=0;attempt<24;attempt++){const p=buildCrossword(size,lang,(seed+Math.imul(attempt,2654435761))>>>0);if(!best||p.entries.length>best.entries.length)best=p;if(best.entries.length>=target)break;}
 return best;
}
export function crosswordComplete(puzzle,values) {return Array.isArray(values)&&values.length===puzzle.grid.length&&puzzle.grid.every((v,i)=>!v||normalizeLetter(values[i])===v);}
export function restoreCrosswordState(puzzle,value,starter=false) {
 const saved=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const initial=Array(puzzle.grid.length).fill('');if(starter)puzzle.entries.forEach(e=>{initial[e.indices[0]]=e.word[0];});
 const raw=Array.isArray(saved.values)&&saved.values.length===initial.length?saved.values:initial;
 const values=Array.from(puzzle.grid,(letter,i)=>letter?inputLetters(raw[i],puzzle.lang).slice(0,1):'');
 return {values,assisted:starter||saved.assisted===true,completed:crosswordComplete(puzzle,values)};
}
export function editCrosswordText(puzzle,values,entry,index,text) {
 const offset=entry.indices.indexOf(index);if(offset<0)throw new RangeError('Cell does not belong to selected word');
 const nextValues=[...values],letters=[...inputLetters(text,puzzle.lang)].slice(0,entry.indices.length-offset),changed=[];
 if(!letters.length){nextValues[index]='';changed.push(index);}
 else letters.forEach((letter,i)=>{const cell=entry.indices[offset+i];nextValues[cell]=letter;changed.push(cell);});
 const next=letters.length?entry.indices[Math.min(offset+letters.length,entry.indices.length-1)]:index;
 return {values:nextValues,changed,next};
}
export function nextCrosswordCell(puzzle,index,key) {
 const {size,lang}=puzzle,delta={ArrowDown:size,ArrowUp:-size,ArrowRight:lang==='ar'?-1:1,ArrowLeft:lang==='ar'?1:-1}[key];
 if(!delta)return index;
 for(let next=index+delta;next>=0&&next<puzzle.grid.length;next+=delta){
  if(Math.abs(delta)===1&&Math.floor(next/size)!==Math.floor(index/size))break;
  if(puzzle.grid[next])return next;
 }
 return index;
}
export function mount(root,context) {
 const {t,lang}=context,size={mini:5,midi:9,crossword:13}[context.game]||5;
 const previousDir=root.getAttribute('dir');root.replaceChildren();root.dir=lang==='ar'?'rtl':'ltr';
 const puzzle=makeCrossword(size,lang,context.seed),starter=context.variant==='starter';
 let saved;try{saved=context.load(null);}catch{saved=null;}
 let state=restoreCrosswordState(puzzle,saved,starter);
 let active=[...puzzle.entries].sort((a,b)=>a.number-b.number)[0],selected=active.indices[0];
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const intro=el('p',t(...CROSSWORD_COPY.intro));
 const details=el('details'),summary=el('summary',t(...CROSSWORD_COPY.how));
 details.append(summary,el('p',t(...CROSSWORD_COPY.instructions)));
 const layout=el('div',undefined,'pc-layout'),left=el('div'),right=el('div',undefined,'pc-clues');
 const current=el('p',undefined,'pc-current');current.setAttribute('aria-live','polite');
 const board=el('div',undefined,'pc-board');board.dataset.size=size;board.style.gridTemplateColumns=`repeat(${size},1fr)`;board.setAttribute('role','group');board.setAttribute('aria-label',t('Crossword grid','شبكة الكلمات المتقاطعة'));
 const cells=[],inputs=[];
 puzzle.grid.forEach((letter,i)=>{const cell=el('div',undefined,`pc-cell${letter?'':' pc-block'}`);cells[i]=cell;
  if(letter){const number=puzzle.entries.find(e=>e.indices[0]===i)?.number;if(number)cell.append(el('span',String(number)));
   const input=el('input');input.type='text';input.value=state.values[i]||'';input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','characters');input.setAttribute('aria-label',t(`Row ${Math.floor(i/size)+1}, column ${i%size+1}`,`الصف ${Math.floor(i/size)+1}، العمود ${i%size+1}`));
   input.addEventListener('focus',()=>{select(i);input.select();});
   input.addEventListener('click',()=>input.select());
   input.addEventListener('input',event=>{if(event.isComposing)return;const entry=active.indices.includes(i)?active:puzzle.entries.find(e=>e.indices.includes(i)),edit=editCrosswordText(puzzle,state.values,entry,i,input.value);state.values=edit.values;edit.changed.forEach(cell=>{inputs[cell].value=state.values[cell];cells[cell].classList.remove('pc-wrong');inputs[cell].setAttribute('aria-invalid','false');});save();inputs[edit.next].focus();inputs[edit.next].select();});
   input.addEventListener('keydown',event=>{
    if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='Enter'){event.preventDefault();const other=puzzle.entries.find(e=>e.id!==active.id&&e.indices.includes(i));if(other){active=other;select(i);}return;}
    if(event.key==='Backspace'){event.preventDefault();if(state.values[i]){state.values[i]='';input.value='';cells[i].classList.remove('pc-wrong');input.setAttribute('aria-invalid','false');save();}else moveWithin(i,-1);return;}
    if(['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();inputs[nextCrosswordCell(puzzle,i,event.key)].focus();}
   });inputs[i]=input;cell.append(input);
  }else cell.setAttribute('aria-hidden','true');board.append(cell);
 });
 const buttons=new Map();
 for(const direction of ['across','down']){const group=el('div');group.append(el('h2',direction==='across'?t('Across','أفقياً'):t('Down','رأسياً')));const list=el('ol');
  for(const entry of puzzle.entries.filter(e=>e.d===direction).sort((a,b)=>a.number-b.number)){const li=el('li'),button=el('button',`${entry.number}. ${entry.clue} (${entry.word.length})`);button.type='button';button.setAttribute('aria-pressed','false');button.onclick=()=>{active=entry;inputs[entry.indices.find(i=>!state.values[i])??entry.indices[0]].focus();};li.append(button);list.append(li);buttons.set(entry.id,button);}
  group.append(list);right.append(group);
 }
 const tools=el('div',undefined,'pc-tools'),status=el('p','', 'pc-status');status.setAttribute('role','status');
 const check=el('button',t('Check letters','افحص الحروف'));check.type='button';check.onclick=()=>{let wrong=0;puzzle.grid.forEach((v,i)=>{const bad=!!v&&!!state.values[i]&&v!==state.values[i];cells[i].classList.toggle('pc-wrong',bad);inputs[i]?.setAttribute('aria-invalid',String(bad));if(bad)wrong++;});if(state.values.some(Boolean)){state.assisted=true;save();}status.textContent=wrong?t(`${wrong} incorrect letter${wrong===1?'':'s'} marked.`,`تم تحديد ${wrong} من الحروف غير الصحيحة.`):t('Every filled letter is correct so far.','كل الحروف المملوءة صحيحة حتى الآن.');};
 const reveal=el('button',t('Reveal selected word','اكشف الكلمة المحددة'));reveal.type='button';reveal.onclick=()=>{active.indices.forEach((i,j)=>{state.values[i]=active.word[j];inputs[i].value=active.word[j];cells[i].classList.remove('pc-wrong');inputs[i].setAttribute('aria-invalid','false');});state.assisted=true;save();if(!state.completed)status.textContent=t('Word revealed. This puzzle is marked as assisted.','كُشفت الكلمة وسُجّل استخدام المساعدة.');};
 tools.append(check,reveal);left.append(current,board,tools,status);layout.append(left,right);root.append(intro,details,layout);
 function select(i){selected=i;if(!active.indices.includes(i))active=puzzle.entries.find(e=>e.indices.includes(i));cells.forEach((cell,index)=>{cell.classList.toggle('pc-active',active.indices.includes(index));cell.classList.toggle('pc-selected',index===i);});buttons.forEach((button,id)=>button.setAttribute('aria-pressed',String(id===active.id)));current.textContent=`${active.number} · ${active.d==='across'?t('Across','أفقياً'):t('Down','رأسياً')} — ${active.clue}`;}
 function moveWithin(i,step){const next=active.indices[active.indices.indexOf(i)+step];if(next!==undefined)inputs[next].focus();}
 function save(){state.completed=crosswordComplete(puzzle,state.values);context.save(state);if(!state.completed)status.textContent='';if(state.completed)status.textContent=state.assisted?t('Puzzle complete — with a little help. Well done!','اكتمل اللغز مع بعض المساعدة. أحسنت!'):t('Every word in place. Puzzle complete!','كل كلمة في مكانها. اكتمل اللغز!');}
 select(selected);save();
 return ()=>{if(previousDir===null)root.removeAttribute('dir');else root.setAttribute('dir',previousDir);};
}
