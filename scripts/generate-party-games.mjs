import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partyLanding } from '../party-games-markup.js';
import { PARTY_COPY } from '../party-games-copy.js';
import { partyPath, PARTY_ROUTES } from '../party-games-engine.js';
import { siteHeader, navigationScript } from './site-navigation-markup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function generatePartyGames({ check = false } = {}) {
  for (const game of Object.keys(PARTY_ROUTES)) for (const lang of ['en', 'ar']) {
    const ar = lang === 'ar', t = PARTY_COPY[lang], most = game === 'mostLikely';
    const route = partyPath(game, lang), alternate = partyPath(game, ar ? 'en' : 'ar');
    const name = most ? t.mostTitle : t.knowTitle, description = most ? t.mostIntro : t.knowIntro;
    const title = `${name} | Riddle Arabia`, url = `https://riddlearabia.com${route}`;
    const graph = { '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebPage', '@id': `${url}#webpage`, name, description, url, inLanguage: lang, isPartOf: { '@id': 'https://riddlearabia.com/#website' }, mainEntity: { '@id': `${url}#game` } },
      { '@type': 'VideoGame', '@id': `${url}#game`, name, description, url, inLanguage: lang, gamePlatform: 'Web browser', isAccessibleForFree: true },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: ar ? 'الرئيسية' : 'Home', item: ar ? 'https://riddlearabia.com/ar/' : 'https://riddlearabia.com/' }, { '@type': 'ListItem', position: 2, name: ar ? 'الألعاب' : 'Games', item: `https://riddlearabia.com${ar ? '/ar/play/' : '/play'}` }, { '@type': 'ListItem', position: 3, name, item: url }] },
    ] };
    const html = `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}"><head>
<meta charset="utf-8"><meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1"><meta name="theme-color" content="#fffaf2">
<title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="referrer" content="no-referrer">
<link rel="canonical" href="${url}"><link rel="alternate" hreflang="en" href="https://riddlearabia.com${partyPath(game, 'en')}"><link rel="alternate" hreflang="ar" href="https://riddlearabia.com${partyPath(game, 'ar')}"><link rel="alternate" hreflang="x-default" href="https://riddlearabia.com${partyPath(game, 'en')}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:type" content="website"><meta property="og:locale" content="${ar ? 'ar_AE' : 'en_US'}"><meta property="og:site_name" content="Riddle Arabia"><meta property="og:image" content="https://riddlearabia.com/assets/riddlearabia-og-image.png"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="600"><meta property="og:image:height" content="315"><meta property="og:image:alt" content="Riddle Arabia"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="https://riddlearabia.com/assets/riddlearabia-og-image.png">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/party-games.css"><script defer src="/privacy-consent.js?v=2026080101"></script>${navigationScript}<script type="module" src="/party-games.js"></script>
<script type="application/ld+json">${JSON.stringify(graph).replaceAll('<', '\\u003c')}</script>
</head><body data-party-game="${game}" data-route-lang="${lang}"><a class="skip-link" href="#party-main">${ar ? 'انتقل إلى المحتوى' : 'Skip to main content'}</a>
${siteHeader({ lang, alternate, active: 'games' })}
<main class="party-shell" id="party-main"><nav class="page-breadcrumb" aria-label="${ar ? 'مسار التصفح' : 'Breadcrumb'}"><a href="${ar ? '/ar/' : '/'}">${ar ? 'الرئيسية' : 'Home'}</a><span aria-hidden="true">›</span><a href="${ar ? '/ar/play/' : '/play'}">${ar ? 'الألعاب' : 'Games'}</a><span aria-hidden="true">›</span><span aria-current="page">${name}</span></nav>${partyLanding(game, lang)}<noscript><p class="party-warning">${ar ? 'تحتاج هذه اللعبة إلى جافاسكريبت. يمكنك تفعيله في المتصفح، ثم تحديث الصفحة.' : 'This game needs JavaScript. Enable it in your browser, then refresh this page.'}</p></noscript></main>
<footer class="shell site-footer"><p>${t.about}</p><a href="${ar ? '/ar/play/' : '/play'}">${t.games}</a> · <a href="${ar ? '/ar/privacy/' : '/privacy'}">${t.privacy}</a><p>© 2026 Riddle Arabia</p></footer></body></html>\n`;
    const relative = ar ? `ar/games/${PARTY_ROUTES[game]}/index.html` : `${PARTY_ROUTES[game]}.html`;
    const target = path.join(root, relative);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) throw Error(`Party game page is stale: ${relative}`);
    } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, html); }
  }
}
generatePartyGames({ check: process.argv.includes('--check') });
