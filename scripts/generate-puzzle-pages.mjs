import { illustrationMarkup, gameIllustrationId } from '../site-illustrations.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PUZZLES, BONUS } from '../puzzle-catalog.js';
import { PUZZLE_ROUTES, puzzlePath, puzzleURL } from '../puzzle-routes.js';
import { PUZZLE_EDITORIAL } from '../puzzle-pages.js';
import { puzzleMarkup } from './puzzle-markup.mjs';
import { siteHeader, navigationScript } from './site-navigation-markup.mjs';
import { PRIMARY_SITE_ORIGIN } from './public-site-identity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function renderPuzzlePage(id, lang = 'en') {
  const route = PUZZLE_ROUTES.find(item => item.id === id), game = PUZZLES.find(item => item.id === id), copy = PUZZLE_EDITORIAL[id];
  if (!route || !copy || !['en','ar'].includes(lang)) throw new Error('Unknown puzzle page');
  const ar = lang === 'ar', pick = pair => pair[ar ? 1 : 0], t = (en, arabic) => ar ? arabic : en;
  const canonical = `${PRIMARY_SITE_ORIGIN}${route.paths[lang]}`, brand = t('Riddle Arabia','ريدل أرابيا');
  const title = `${pick(copy.title)} | ${brand}`, description = pick(copy.description);
  const gameName = pick(game.title), directory = ar ? '/ar/play/' : '/play';
  const page = {'@type':id === 'bonus' ? 'CollectionPage' : 'WebPage', '@id':`${canonical}#webpage`, url:canonical, name:title, description, inLanguage:lang, isAccessibleForFree:true};
  const graph = [page, {'@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:t('Games','الألعاب'),item:`${PRIMARY_SITE_ORIGIN}${directory}`},
    {'@type':'ListItem',position:2,name:gameName,item:canonical},
  ]}];
  if (id !== 'bonus') {
    page.mainEntity = {'@id':`${canonical}#game`};
    graph.push({'@type':'VideoGame','@id':`${canonical}#game`,name:gameName,description,url:canonical,inLanguage:lang,isAccessibleForFree:true,gamePlatform:'Web browser',publisher:{'@type':'Organization',name:brand,url:PRIMARY_SITE_ORIGIN+'/'}});
  }
  const sharedNote = ['bonus','duel'].includes(id) ? '' : t('Your progress is saved on this device. The daily selection changes at midnight in Dubai; an open puzzle stays on its current board. Word collections are finite, and generated boards draw on the game’s existing rules or clue collection. A shared date opens that date’s puzzle without changing today’s streak.', 'يُحفظ تقدّمك على هذا الجهاز. يتغير اختيار اليوم عند منتصف الليل في دبي؛ وتبقى اللوحة المفتوحة كما هي. مجموعات الكلمات محدودة، وتستند اللوحات المولّدة إلى قواعد اللعبة أو مجموعة تعريفاتها. يفتح التاريخ المشارَك لغز ذلك اليوم دون تغيير سلسلة اليوم الحالي.');
  const related = id === 'bonus' ? BONUS.map(item => ({path:puzzleURL(item.id,lang,{variant:item.variant}),name:pick(item.title)}))
    : (['mini','midi','crossword'].includes(id) ? ['mini','midi','crossword'].filter(key=>key!==id) : id==='duel'?['hive','letter-square']:['mini','sudoku'].filter(key=>key!==id)).map(key=>({path:puzzlePath(key,lang),name:pick(PUZZLES.find(item=>item.id===key).title)}));
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${ar?'rtl':'ltr'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${PRIMARY_SITE_ORIGIN}${route.paths.en}" />
    <link rel="alternate" hreflang="ar" href="${PRIMARY_SITE_ORIGIN}${route.paths.ar}" />
    <link rel="alternate" hreflang="x-default" href="${PRIMARY_SITE_ORIGIN}${route.paths.en}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${brand}" />
    <meta property="og:image" content="${PRIMARY_SITE_ORIGIN}/assets/riddlearabia-og-image.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="600" />
    <meta property="og:image:height" content="315" />
    <meta property="og:image:alt" content="${brand}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${PRIMARY_SITE_ORIGIN}/assets/riddlearabia-og-image.png" />
    <meta name="twitter:image:alt" content="${brand}" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="preload" href="/styles.css?v=2026091102" as="style" />
    <link rel="stylesheet" href="/styles.css?v=2026091102" />
    <link rel="stylesheet" href="/puzzle-room.css" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <script defer src="/privacy-consent.js?v=2026080101"></script>
    <script type="module" src="/puzzle-room.js"></script>
    <script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph},null,2).replaceAll('<','\\u003c')}</script>
  </head>
  <body class="page-play" data-page="play" data-puzzle-page="${id}">
    <a href="#top" class="skip-link">${t('Skip to main content','انتقل إلى المحتوى الرئيسي')}</a>
    ${siteHeader({lang,alternate:route.paths[ar?'en':'ar'],active:'games'})}
    <main id="top">
      ${puzzleMarkup(lang,{game:id})}
      <noscript><p class="shell">${t('Enable JavaScript to play. You can read the rules below without it.','فعّل JavaScript للعب. يمكنك قراءة القواعد أدناه دون تفعيله.')}</p></noscript>
      <section class="shell section-block" aria-labelledby="puzzle-about-title" data-puzzle-editorial>
        <div class="feature-panel">
          ${illustrationMarkup(gameIllustrationId(id), 'topic')}
          <h2 id="puzzle-about-title">${t(`About ${gameName}`,`عن ${gameName}`)}</h2>
          <p>${esc(pick(copy.intro))}</p>
          <h3>${t('How to play','طريقة اللعب')}</h3>
          <ol>${copy.rules.map(rule=>`<li>${esc(pick(rule))}</li>`).join('')}</ol>
          <p>${esc(pick(copy.note))}</p>
${sharedNote?`          <h3>${t('Daily play and saved progress','اللعب اليومي والتقدّم المحفوظ')}</h3><p>${esc(sharedNote)}</p>\n`:''}          <nav class="hero-actions" aria-label="${t('More games','ألعاب أخرى')}">${related.map(item=>`<a class="ghost-btn" href="${esc(item.path)}">${esc(item.name)}</a>`).join('')}<a class="text-btn" href="${directory}">${t('All games','جميع الألعاب')}</a></nav>
        </div>
      </section>
    </main>
    <footer class="site-footer shell"><div class="footer-inner"><p class="footer-copy">${brand} · 2026</p><nav class="footer-site-links" aria-label="${t('Riddle Arabia information','معلومات ريدل أرابيا')}"><a href="${ar?'/ar/about/':'/about'}">${t('About & content standards','عن الموقع ومعايير المحتوى')}</a><a href="${ar?'/ar/privacy/':'/privacy'}">${t('Privacy Centre','مركز الخصوصية')}</a><a href="${ar?'/ar/collections/':'/collections'}">${t('Collections','المجموعات')}</a></nav></div></footer>
    ${navigationScript}
  </body>
</html>
`;
}

export async function generatePuzzlePages({check=false}={}) {
  const stale=[];
  for (const route of PUZZLE_ROUTES) for (const lang of ['en','ar']) {
    const relative = lang === 'en' ? `${route.slug}.html` : `ar/games/${route.slug}/index.html`;
    const file=resolve(root,relative), desired=renderPuzzlePage(route.id,lang);
    let current;try{current=await readFile(file,'utf8');}catch{/* New route. */}
    if(current===desired)continue;
    stale.push(relative);
    if(!check){await mkdir(dirname(file),{recursive:true});await writeFile(file,desired);}
  }
  if(check&&stale.length)throw new Error(`Puzzle pages are stale: ${stale.join(', ')}`);
  return stale;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generatePuzzlePages({check:process.argv.includes('--check')});
  console.log('Bilingual puzzle pages are current (26 pages).');
}
