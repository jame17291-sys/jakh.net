// Vertical "card reel" markup for a plan entry: a 1080x1920 page whose
// `window.seek(t)` draws the frame for time t (seconds), so the renderer can
// capture frames deterministically. Timeline (REEL_SECONDS total):
//   0.0-1.0  brand header and topic fade in
//   0.6-2.4  Arabic question, then English question, slide up
//   3.0-10.0 countdown ring, 7 to 1
//  10.0-10.6 answer flips in (chime)
//  13.0-15.0 end card: collection link and logo
import { CARD_SIZE, collection, card } from "./social-cards.mjs";

export const REEL_WIDTH = CARD_SIZE;
export const REEL_HEIGHT = 1920;
export const REEL_SECONDS = 15;
export const REEL_FPS = 30;
export const COUNTDOWN_START = 3;
export const COUNTDOWN_SECONDS = 7;
export const REVEAL_AT = COUNTDOWN_START + COUNTDOWN_SECONDS;
export const END_CARD_AT = 13;

const escape = (value) => String(value).replace(/[&<>"]/gu, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function size(length, base, min) {
  if (length <= 60) return base;
  if (length <= 100) return Math.round(base * 0.85);
  if (length <= 140) return Math.round(base * 0.72);
  return min;
}

export function reelHtml(entry, { logoDataUrl = "" } = {}) {
  const page = collection(entry.collection);
  const item = card(entry.topic, entry.id);
  const topicAr = page.headings.ar.replace(/ مع الأجوبة$/u, "");
  const topicEn = page.headings.en.replace(/ with answers$/u, "");
  const longestQ = Math.max(item.question.ar.length, Math.round(item.question.en.length * 0.8));
  const longestA = Math.max(item.answer.ar.length, Math.round(item.answer.en.length * 0.8));
  return `<!doctype html>
<html lang="ar"><head><meta charset="utf-8">
<style>
  @font-face { font-family: "Lora"; src: url("file:///usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf"); font-weight: 400 700; }
  @font-face { font-family: "Poppins"; src: url("file:///usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "Poppins"; src: url("file:///usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"); font-weight: 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${REEL_WIDTH}px; height: ${REEL_HEIGHT}px; overflow: hidden; }
  body { background: #fff9ed; color: #322016; font-family: "Poppins", "DejaVu Sans", sans-serif; position: relative; }
  .ar { font-family: "DejaVu Sans", sans-serif; direction: rtl; text-align: right; font-weight: 700; }
  .en { font-family: "Lora", serif; direction: ltr; text-align: left; font-weight: 500; }
  .layer { position: absolute; left: 0; right: 0; }
  #header { top: 150px; padding: 0 84px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand img { width: 96px; height: 96px; }
  .brand b { font-family: "Lora", serif; font-size: 44px; font-weight: 700; letter-spacing: -0.02em; display: block; }
  .brand span { display: block; font-family: "DejaVu Sans", sans-serif; font-size: 28px; color: #604333; font-weight: 700; }
  .eyebrow { color: #94431f; font-weight: 700; font-size: 28px; line-height: 1.35; text-align: right; }
  #question { top: 420px; padding: 0 84px; display: flex; flex-direction: column; gap: 40px; }
  #question .ar { font-size: ${size(longestQ, 84, 56)}px; line-height: 1.45; }
  #question .rule { width: 140px; height: 8px; background: #c5832e; border-radius: 4px; align-self: flex-end; }
  #question .en { font-size: ${size(longestQ, 54, 38)}px; line-height: 1.4; color: #604333; }
  #ring { top: 1210px; display: flex; flex-direction: column; align-items: center; gap: 26px; }
  #ring svg { width: 300px; height: 300px; transform: rotate(-90deg); }
  #ring circle { fill: none; stroke-width: 18; }
  #ring .track { stroke: #f8ecd9; }
  #ring .arc { stroke: #94431f; stroke-linecap: round; }
  #ring .num { position: absolute; top: 0; width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 120px; color: #94431f; }
  #ring .hint { font-family: "DejaVu Sans", sans-serif; font-weight: 700; font-size: 32px; color: #604333; direction: rtl; }
  #ring .hint-en { font-size: 26px; color: #604333; }
  #answer { top: 1150px; padding: 0 84px; display: flex; flex-direction: column; gap: 34px; }
  #answer .label { color: #94431f; font-weight: 700; font-size: 30px; text-align: right; }
  #answer .ar { font-size: ${size(longestA, 92, 56)}px; line-height: 1.4; color: #733217; }
  #answer .en { font-size: ${size(longestA, 56, 38)}px; line-height: 1.4; color: #733217; }
  #end { top: 0; bottom: 0; background: #94431f; color: #fff9ed; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px; padding: 0 100px; text-align: center; }
  #end img { width: 160px; height: 160px; border-radius: 28px; }
  #end .big { font-family: "DejaVu Sans", sans-serif; font-weight: 700; font-size: 60px; direction: rtl; }
  #end .mid { font-family: "Lora", serif; font-size: 44px; }
  #end .url { font-weight: 700; font-size: 52px; letter-spacing: -0.01em; word-break: break-all; }
  #foot { bottom: 150px; padding: 0 84px; display: flex; justify-content: space-between; align-items: center; color: #94431f; font-weight: 700; font-size: 28px; }
</style></head>
<body>
  <div id="header" class="layer">
    <div class="brand">${logoDataUrl ? `<img src="${logoDataUrl}" alt="">` : ""}<div><b>Riddle Arabia</b><span>ريدل أرابيا</span></div></div>
    <div class="eyebrow"><div class="ar">${escape(topicAr)}</div><div>${escape(topicEn)}</div></div>
  </div>
  <div id="question" class="layer">
    <div class="ar" id="qar">${escape(item.question.ar)}</div>
    <div class="rule"></div>
    <div class="en" id="qen">${escape(item.question.en)}</div>
  </div>
  <div id="ring" class="layer">
    <div style="position:relative;width:300px;height:300px">
      <svg viewBox="0 0 300 300"><circle class="track" cx="150" cy="150" r="132"/><circle class="arc" id="arc" cx="150" cy="150" r="132"/></svg>
      <div class="num" id="num">7</div>
    </div>
    <div class="hint">فكّر... الجواب بعد قليل</div>
    <div class="hint-en">Think... the answer is coming</div>
  </div>
  <div id="answer" class="layer">
    <div class="label"><span class="ar">الجواب</span> · The answer</div>
    <div class="ar">${escape(item.answer.ar)}</div>
    <div class="en">${escape(item.answer.en)}</div>
  </div>
  <div id="foot" class="layer"><span>riddlearabia.com</span><span class="ar">اكتب جوابك في التعليقات</span></div>
  <div id="end" class="layer">
    ${logoDataUrl ? `<img src="${logoDataUrl}" alt="">` : ""}
    <div class="big">30 سؤالاً آخر مجانًا</div>
    <div class="mid">30 more, free, no sign-up</div>
    <div class="url">riddlearabia.com${escape(page.paths.en)}</div>
  </div>
<script>
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const circumference = 2 * Math.PI * 132;
  const el = (id) => document.getElementById(id);
  function fadeUp(node, start, duration, t, distance = 40) {
    const p = ease((t - start) / duration);
    node.style.opacity = p;
    node.style.transform = "translateY(" + ((1 - p) * distance) + "px)";
  }
  window.seek = function (t) {
    fadeUp(el("header"), 0, 0.8, t, 20);
    fadeUp(el("qar"), 0.6, 0.8, t);
    fadeUp(el("qen"), 1.4, 0.8, t);
    el("foot").style.opacity = ease((t - 2) / 0.6);
    const ring = el("ring");
    const inCountdown = t >= ${COUNTDOWN_START} - 0.5 && t < ${REVEAL_AT};
    ring.style.opacity = inCountdown ? ease((t - (${COUNTDOWN_START} - 0.5)) / 0.5) : 0;
    const elapsed = clamp((t - ${COUNTDOWN_START}) / ${COUNTDOWN_SECONDS});
    el("arc").style.strokeDasharray = circumference;
    el("arc").style.strokeDashoffset = circumference * elapsed;
    el("num").textContent = String(Math.max(1, ${COUNTDOWN_SECONDS} - Math.floor(Math.max(0, t - ${COUNTDOWN_START}))));
    const answer = el("answer");
    const reveal = ease((t - ${REVEAL_AT}) / 0.6);
    answer.style.opacity = t >= ${REVEAL_AT} ? reveal : 0;
    answer.style.transform = "perspective(1600px) rotateX(" + ((1 - reveal) * -70) + "deg) translateY(" + ((1 - reveal) * 30) + "px)";
    answer.style.transformOrigin = "top center";
    const end = el("end");
    end.style.opacity = ease((t - ${END_CARD_AT}) / 0.7);
    end.style.pointerEvents = "none";
  };
  window.seek(0);
</script>
</body></html>`;
}

// Soft tick each countdown second and a two-note chime at the reveal, built
// from sine waves inside ffmpeg (no sampled or licensed audio anywhere).
export function audioExpression() {
  const ticks = `0.18*sin(2*PI*1200*t)*exp(-60*mod(t,1))*between(t,${COUNTDOWN_START},${REVEAL_AT}-0.01)`;
  const chime = `0.25*(sin(2*PI*1046.5*t)+0.6*sin(2*PI*1318.5*t))*exp(-3*(t-${REVEAL_AT}))*gte(t,${REVEAL_AT})`;
  return `${ticks}+${chime}`;
}
