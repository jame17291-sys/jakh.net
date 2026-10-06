import { PARTY_COPY } from './party-games-copy.js';
import { partyPath, escapeParty as e } from './party-games-engine.js';

export function partyDirectory(lang = 'en') {
  const t = PARTY_COPY[lang];
  return `<!-- party-games:start --><section class="party-directory shell section-block" data-party-directory data-puzzle-directory aria-labelledby="partyDirectoryTitle"><div class="feature-panel"><h2 id="partyDirectoryTitle">${lang === 'ar' ? 'ألعاب الأصدقاء' : 'Friendship games'}</h2><p>${lang === 'ar' ? 'اجمع أصدقاءك. ابدأ الحكايات. واستعد للمفاجآت.' : 'Gather your friends. Get the stories going. Expect surprises.'}</p><div class="home-discovery-links">${['mostLikely', 'knowMe'].map(game => `<a class="ra-art-link party-directory-card" href="${partyPath(game, lang)}"><img class="ra-art ra-art-thumb" src="/assets/${game === 'mostLikely' ? 'most-likely-to' : 'how-well-do-you-know-me'}.svg" width="480" height="320" alt="" loading="lazy" decoding="async"><div><span>${e(game === 'mostLikely' ? t.mostTitle : t.knowTitle)}</span><small>${e(game === 'mostLikely' ? t.mostCard : t.knowCard)}</small></div></a>`).join('')}</div></div></section><!-- party-games:end -->`;
}

export function partyLanding(game, lang = 'en') {
  const t = PARTY_COPY[lang], most = game === 'mostLikely';
  return `<section class="party-hero" aria-labelledby="partyTitle"><div><p class="party-eyebrow">${t.eyebrow}</p><h1 id="partyTitle">${e(most ? t.mostTitle : t.knowTitle)}</h1><p class="party-lead">${e(most ? t.mostIntro : t.knowIntro)}</p><p class="party-small">${t.free}</p></div><img src="/assets/${most ? 'most-likely-to' : 'how-well-do-you-know-me'}.svg" width="480" height="320" alt="" fetchpriority="high"></section>
  <section id="party-app" class="party-panel" aria-busy="true"><p>${t.loading}</p><button class="party-button primary" data-party-action="start" disabled>${most ? t.mostStart : t.knowStart}</button></section><p id="party-feedback" class="party-feedback" role="status" aria-live="polite"></p>
  <section class="party-how" aria-labelledby="partyHow"><h2 id="partyHow">${t.how}</h2><p>${e(most ? t.mostHow : t.knowHow)}</p><p>${e(most ? t.skipHint : t.consent)}</p></section>`;
}
