import { SHOWS } from './tv-trivia-engine.js';
import { COPY } from './tv-trivia-copy.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function landingMarkup(lang = 'en', ready = false, counts = {}) {
  const t = COPY[lang];
  const disabled = ready ? '' : 'disabled';
  return `<div id="tvTrivia" class="tv-trivia shell" aria-busy="${!ready}">
    <section class="tv-hero" aria-labelledby="tvTitle">
      <div><p class="tv-eyebrow">${t.eyebrow}</p><h1 id="tvTitle">${t.title}</h1><p class="tv-intro">${t.intro}</p>
      <div class="tv-actions"><button class="tv-button tv-primary" data-tv="mixed" ${disabled}>${t.mixed}<span aria-hidden="true">↗</span></button><a class="tv-text-button" href="#tvShows">${t.choose}</a></div>
      <p class="tv-reassurance"><span class="tv-status-dot" aria-hidden="true"></span>${t.safe}<span aria-hidden="true"> · </span>${t.relaxed}</p></div>
      <img class="tv-hero-art" data-illustration="topic-tv-shows-trivia" src="/assets/illustrations/topic-tv-shows-trivia-480.webp" alt="" width="480" height="320" fetchpriority="high" decoding="async" />
    </section>
    <div id="tvMessage" role="status" aria-live="polite">${ready ? '' : t.loading}</div>
    <section id="tvShows" class="tv-show-section" aria-labelledby="tvShowsTitle" tabindex="-1">
      <div class="tv-section-heading"><div><h2 id="tvShowsTitle">${t.shows}</h2><p>${t.showsIntro}</p></div><span class="tv-small">${t.showCount}</span></div>
      <div class="tv-show-grid">${SHOWS.map((s, i) => `<article class="tv-show-card">
        <button class="tv-show-play" data-tv="play-show" data-show="${s.id}" ${disabled} aria-label="${escape(`${t.play}: ${s[lang]}`)}">
          <img src="/assets/tv/${s.id}-600.webp" srcset="/assets/tv/${s.id}-360.webp 360w, /assets/tv/${s.id}-600.webp 600w" sizes="(max-width: 700px) calc(50vw - 28px), (max-width: 1000px) 30vw, 280px" width="600" height="400" alt="" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async" />
          <span class="tv-show-body"><span class="tv-small">${s.genre[lang]}</span><strong>${escape(s[lang])}</strong>${Number.isInteger(counts[s.key]) ? `<span class="tv-small tv-bank-count">${counts[s.key]} ${t.bankCount}</span>` : ''}<span class="tv-card-action">${t.play}<span aria-hidden="true">↗</span></span></span>
        </button><button class="tv-options-link" data-tv="options" data-show="${s.id}" ${disabled} aria-label="${escape(`${t.optionsFor} ${s[lang]}`)}">${t.options}</button>
      </article>`).join('')}</div>
    </section>
    <section id="tvResume" hidden class="tv-resume" aria-label="${t.resume}"></section>
    <section class="tv-other" aria-labelledby="tvOtherTitle"><h2 id="tvOtherTitle">${t.more}</h2><div class="tv-mode-grid">
      <article><span class="tv-mode-number" aria-hidden="true">01</span><h3>${t.timed}</h3><p>${t.timedHint}</p><button class="tv-text-button" data-tv="timed" ${disabled}>${t.timed}<span aria-hidden="true">↗</span></button></article>
      <article><span class="tv-mode-number" aria-hidden="true">02</span><h3>${t.practice}</h3><p>${t.practiceHint}</p><button class="tv-text-button" data-tv="practice" ${disabled}>${t.practice}<span aria-hidden="true">↗</span></button></article>
      <article><span class="tv-mode-number" aria-hidden="true">03</span><h3>${t.friends}</h3><p>${t.friendsHint}</p><div class="tv-actions"><button class="tv-text-button" data-tv="create" ${disabled}>${t.create}</button><button class="tv-text-button" data-tv="join" ${disabled}>${t.join}</button></div></article>
    </div></section>
    <p class="tv-save-note">${t.save} <button class="tv-text-button" data-tv="sync" ${disabled}>${t.sync}</button></p>
    <noscript><p>${lang === 'ar' ? 'فعّل JavaScript لبدء التحدّي التفاعلي.' : 'Enable JavaScript to play the interactive quiz.'}</p></noscript>
  </div>`;
}
