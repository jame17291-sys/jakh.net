import { FRIENDSHIP_COPY } from './friendship-games-copy.js';
import { FRIENDSHIP_ROUTES, friendshipPath } from './friendship-games-engine.js';
import { escapeParty as e } from './party-games-engine.js';

function cover(game, hero = false) {
  const asset = `/assets/friendship/${FRIENDSHIP_ROUTES[game]}`;
  return `<img class="${hero ? 'friendship-cover' : 'ra-art ra-art-thumb'}" src="${asset}-480.webp" srcset="${asset}-480.webp 480w, ${asset}-960.webp 960w" sizes="${hero ? '(max-width:560px) calc(100vw - 32px), 420px' : '(max-width:560px) 85px, (max-width:800px) 100px, 180px'}" width="480" height="320" alt="" ${hero ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

export function friendshipLanding(game, lang = 'en') {
  const t = FRIENDSHIP_COPY[lang], copy = t[game];
  return `<section class="party-hero" aria-labelledby="partyTitle"><div><p class="party-eyebrow">${t.eyebrow}</p><h1 id="partyTitle">${e(copy.title)}</h1><p class="party-lead">${e(copy.intro)}</p><p class="party-small">${t.free}</p></div>${cover(game, true)}</section>
  <section id="party-app" class="party-panel" aria-busy="false"></section><p id="party-feedback" class="party-feedback" role="status" aria-live="polite"></p>
  <section class="party-how" aria-labelledby="partyHow"><h2 id="partyHow">${e(lang === 'ar' ? 'طريقة اللعب' : 'How to play')}</h2><p>${e(copy.how)}</p><p>${e(lang === 'ar' ? 'ابقوا لطفاء: يمكن لأي شخص تجاوز جولة في أي وقت.' : 'Keep it kind: anyone can skip a round at any time.')}</p></section>`;
}
export function friendshipDirectoryCards(lang = 'en') {
  const t = FRIENDSHIP_COPY[lang];
  return Object.keys(FRIENDSHIP_ROUTES).map(game => `<a class="ra-art-link party-directory-card" href="${friendshipPath(game, lang)}">${cover(game)}<div><span>${e(t[game].title)}</span><small>${e(t[game].card)}</small></div></a>`).join('');
}
