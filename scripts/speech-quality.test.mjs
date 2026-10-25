import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Execute the shipped engine in an isolated browser-shaped realm. The fake
// clock and synthesis events expose lifecycle failures without claiming native
// pronunciation or depending on the host computer's installed voices.
const source = readFileSync(new URL('../speech-quality.js', import.meta.url), 'utf8');
const localArabic = { name: 'Arabic', voiceURI: 'local-ar', lang: 'ar-SA', localService: true };
const naturalArabic = { name: 'Microsoft Salma Online (Natural)', voiceURI: 'natural-ar', lang: 'ar-EG', localService: false };
const enhancedArabic = { name: 'Arabic Enhanced', voiceURI: 'enhanced-ar', lang: 'ar-AE', localService: true };
const english = { name: 'English', voiceURI: 'local-en', lang: 'en-US', localService: true };

function engine({ voices = [localArabic, naturalArabic, english], supported = true, throws = '', online = true, paused = false } = {}) {
  let now = 0, timerId = 0;
  const timers = new Map(), listeners = new Map(), spoken = [], calls = [];
  let availableVoices = voices;
  class Utterance { constructor(text) { this.text = text; } }
  const synthesis = {
    paused,
    getVoices() { if (throws === 'getVoices') throw new Error('device voices unavailable'); return availableVoices; },
    addEventListener(type, listener) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    cancel() { calls.push('cancel'); if (throws === 'cancel') throw new Error('device cancellation unavailable'); },
    resume() { calls.push('resume'); if (throws === 'resume') throw new Error('device resume unavailable'); synthesis.paused = false; },
    speak(utterance) { calls.push('speak'); if (throws === 'speak' || synthesis.paused) throw new Error('device playback unavailable'); spoken.push(utterance); },
  };
  const context = vm.createContext({
    ...(supported ? { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance } : {}),
    navigator: { onLine: online },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { at: now + Number(delay), callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    queueMicrotask,
    console,
  });
  vm.runInContext(`${source.replace(/\bexport\s+(?=(?:function|const|let|class)\b)/gu, '')}\n;globalThis.api={getBestVoice,prepareSpeechText,speakNaturally};`, context, { filename: 'speech-quality.js' });
  const advance = milliseconds => {
    const deadline = now + milliseconds;
    for (;;) {
      const next = [...timers.entries()].filter(([, item]) => item.at <= deadline).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, item] = next; timers.delete(id); now = item.at; item.callback();
    }
    now = deadline;
  };
  const events = [];
  const speak = options => context.api.speakNaturally({ text: 'ما حاصل 5×4؟', lang: 'ar', onStart: () => events.push('start'), onEnd: () => events.push('end'), onError: reason => events.push(`error:${reason}`), ...options });
  return {
    ...context.api, speak, spoken, calls, events, timers, advance,
    voicesChanged(next) { availableVoices = next; for (const listener of listeners.get('voiceschanged') || []) listener(); },
    event(index, type, error) { spoken[index]?.[`on${type}`]?.({ error }); },
  };
}

test('Arabic voice selection matches normalized locale and never substitutes English', () => {
  const h = engine();
  const normalized = { name: 'Arabic device', voiceURI: 'device', lang: 'AR_AE', localService: true };
  assert.equal(h.getBestVoice([english, normalized], 'ar'), normalized);
  assert.equal(h.getBestVoice([english], 'ar'), null);
  assert.equal(h.getBestVoice([localArabic], 'en'), null);
  assert.equal(h.getBestVoice([], 'ar'), null);
  assert.equal(h.getBestVoice([naturalArabic, localArabic], 'ar'), localArabic);
});

test('the free reader excludes browser-provided cloud voices and prioritizes an installed enhanced voice', () => {
  const h = engine();
  assert.equal(h.getBestVoice([naturalArabic], 'ar'), null);
  assert.equal(h.getBestVoice([localArabic, enhancedArabic, naturalArabic], 'ar'), enhancedArabic);
  assert.equal(h.getBestVoice([localArabic, naturalArabic], 'ar'), localArabic);
});

// Voice lists shaped like the ones Safari and Chrome report on Apple devices:
// novelty voices come first alphabetically, no English voice is the default on
// an Arabic phone, and eloquence voices name their language in brackets.
const apple = (name, lang, uri, extra = {}) => ({ name, lang, voiceURI: uri, localService: true, default: false, ...extra });
const NOVELTY_ENGLISH = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox']
  .map(name => apple(name, 'en-US', `com.apple.speech.synthesis.voice.${name.replace(' ', '')}`));
const ROBOTIC_ENGLISH = [
  ...['Fred', 'Junior', 'Kathy', 'Ralph'].map(name => apple(name, 'en-US', `com.apple.speech.synthesis.voice.${name}`)),
  ...['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley'].map(name => apple(`${name} (English (US))`, 'en-US', `com.apple.eloquence.en-US.${name}`)),
];
const samantha = apple('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha');
const daniel = apple('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel');
const karen = apple('Karen', 'en-AU', 'com.apple.voice.compact.en-AU.Karen');
const moira = apple('Moira', 'en-IE', 'com.apple.voice.compact.en-IE.Moira');
const majed = apple('Majed', 'ar-001', 'com.apple.voice.compact.ar-001.Maged');
const iosArabicPhone = [...NOVELTY_ENGLISH, ...ROBOTIC_ENGLISH, daniel, karen, { ...majed, default: true }, moira, samantha]
  .sort((left, right) => left.name.localeCompare(right.name));
const isNovelty = voice => NOVELTY_ENGLISH.some(novelty => novelty.name === voice?.name);

test('an Arabic iPhone reads English with a natural voice, never a novelty or robotic one', () => {
  const h = engine();
  assert.equal(h.getBestVoice(iosArabicPhone, 'en'), samantha);
  assert.equal(h.getBestVoice(iosArabicPhone, 'ar').name, 'Majed');
  // Without Samantha a British natural voice still beats every novelty voice.
  const withoutSamantha = iosArabicPhone.filter(voice => voice !== samantha);
  assert.equal(h.getBestVoice(withoutSamantha, 'en'), daniel);
  for (let shift = 0; shift < iosArabicPhone.length; shift++) {
    const rotated = [...iosArabicPhone.slice(shift), ...iosArabicPhone.slice(0, shift)];
    assert.equal(h.getBestVoice(rotated, 'en'), samantha, `list order ${shift} does not change the choice`);
  }
});

test('an English iPhone and a Mac prefer enhanced or premium natural voices and skip cloud voices', () => {
  const h = engine();
  const enhanced = apple('Samantha (Enhanced)', 'en-US', 'com.apple.voice.enhanced.en-US.Samantha');
  const iosEnglishPhone = [...NOVELTY_ENGLISH, ...ROBOTIC_ENGLISH, { ...samantha, default: true }, daniel, enhanced, majed];
  assert.equal(h.getBestVoice(iosEnglishPhone, 'en'), enhanced);
  const premiumAva = apple('Ava (Premium)', 'en-US', 'com.apple.voice.premium.en-US.Ava');
  const mac = [
    ...NOVELTY_ENGLISH, ...ROBOTIC_ENGLISH, daniel, karen, moira, samantha,
    apple('Tarik', 'ar-SA', 'com.apple.speech.synthesis.voice.tarik'), apple('Majed', 'ar-001', 'com.apple.voice.compact.ar-001.Maged'),
    { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English', localService: false, default: false },
    { name: 'Google العربية', lang: 'ar', voiceURI: 'Google العربية', localService: false, default: false },
  ];
  assert.equal(h.getBestVoice(mac, 'en'), samantha);
  assert.equal(h.getBestVoice([...mac, premiumAva], 'en'), premiumAva);
  assert.ok(['Tarik', 'Majed'].includes(h.getBestVoice(mac, 'ar').name));
  assert.equal(h.getBestVoice([naturalArabic, apple('Laila', 'ar-SA', 'com.apple.speech.synthesis.voice.laila')], 'ar').name, 'Laila');
});

test('novelty voices are never chosen and robotic ones only when nothing natural is installed', () => {
  const h = engine();
  assert.equal(h.getBestVoice(NOVELTY_ENGLISH, 'en'), null);
  const robotic = h.getBestVoice([...NOVELTY_ENGLISH, ...ROBOTIC_ENGLISH], 'en');
  assert.ok(ROBOTIC_ENGLISH.includes(robotic) && !isNovelty(robotic));
  const plain = apple('English device', 'en-US', 'english-device');
  assert.equal(h.getBestVoice([...NOVELTY_ENGLISH, ...ROBOTIC_ENGLISH, plain], 'en'), plain, 'an ordinary device voice beats a robotic one');
  const espeak = { name: 'eSpeak English', lang: 'en-US', voiceURI: 'espeak-en', localService: true };
  assert.equal(h.getBestVoice([espeak, plain], 'en'), plain);
  const windows = { name: 'Microsoft Jenny (Natural) - English (United States)', lang: 'en-US', voiceURI: 'jenny', localService: true };
  assert.equal(h.getBestVoice([{ name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'david', localService: true }, windows], 'en'), windows);
  const h2 = engine({ voices: iosArabicPhone });
  h2.speakNaturally({ text: 'What goes up and down but never moves?', lang: 'en' });
  assert.equal(h2.spoken[0].voice, samantha);
  assert.equal(h2.spoken[0].lang, 'en-US');
});

test('an installed underscore locale is normalized for the actual native utterance', () => {
  const voice = { name: 'Arabic device', voiceURI: 'device', lang: 'AR_AE', localService: true };
  const h = engine({ voices: [voice] });
  h.speak();
  assert.match(h.spoken[0].lang, /^ar-ae$/iu);
  assert.equal(h.spoken[0].voice, voice);
  h.event(0, 'start'); h.event(0, 'end');
});

test('speech preparation keeps authored Arabic diacritics, names and English copy', () => {
  const h = engine();
  assert.equal(h.prepareSpeechText('  مَنْ هو مُحمَّد؟\nصِفْ صَوْتَهُ.  ', 'ar'), 'مَنْ هو مُحمَّد؟ صِفْ صَوْتَهُ.');
  assert.equal(h.prepareSpeechText('  A  name: Ada Lovelace.\n3.14 / 2  ', 'en'), 'A name: Ada Lovelace. 3.14 / 2');
  assert.equal(h.prepareSpeechText('كم يساوي 5×4؟20', 'ar'), 'كم يساوي 5 في 4؟ 20');
});

test('Arabic maths preparation distinguishes fractions from decimals, times and dates', () => {
  const h = engine();
  assert.equal(h.prepareSpeechText('3.14 و١/٢ و5/8 أم 3/5', 'ar'), '3.14 و١ على ٢ و5 على 8 أم 3 على 5');
  assert.equal(h.prepareSpeechText('الوقت 12:30 والتاريخ 5/10/2026، A/B و2026-10-05', 'ar'), 'الوقت 12:30 والتاريخ 5/10/2026، A/B و2026-10-05');
  assert.equal(h.prepareSpeechText('7−3=4 وx²', 'ar'), '7 ناقص 3 يساوي 4 وx²');
});

test('first speech call is synchronous and only onstart confirms playback', () => {
  const h = engine(), controller = h.speak();
  assert.equal(typeof controller?.cancel, 'function');
  assert.equal(h.spoken.length, 1, 'native speak is called before returning to the tap handler');
  assert.deepEqual(h.events, [], 'queueing alone does not promise audible playback');
  assert.equal(h.spoken[0].lang, h.spoken[0].voice.lang);
  h.event(0, 'start');
  assert.deepEqual(h.events, ['start']);
  h.event(0, 'end');
  assert.deepEqual(h.events, ['start', 'end']);
  assert.equal(h.timers.size, 0);
});

test('a previously paused device is resumed before synchronous playback is queued', () => {
  const h = engine({ paused: true });
  h.speak();
  assert.equal(h.spoken.length, 1);
  h.event(0, 'start'); h.event(0, 'end');
  assert.deepEqual(h.events, ['start', 'end']);
});

test('an empty initial voice list starts with an Arabic hint during the tap instead of waiting', () => {
  const h = engine({ voices: [] });
  h.speak();
  assert.equal(h.spoken.length, 1);
  assert.match(h.spoken[0].lang.toLowerCase(), /^ar(?:-|$)/u);
  h.voicesChanged([localArabic]);
  assert.equal(h.spoken.length, 1, 'late voice discovery cannot start duplicate speech');
  h.event(0, 'start'); h.event(0, 'end');
  assert.deepEqual(h.events, ['start', 'end']);
});

test('a device with only English voices reports an Arabic fallback without speaking the text', () => {
  const h = engine({ voices: [english] });
  h.speak();
  assert.equal(h.spoken.length, 0);
  assert.deepEqual(h.events, ['error:voice-unavailable', 'end']);
  assert.equal(h.timers.size, 0);
});

test('unavailable speech reports an honest terminal fallback', () => {
  const h = engine({ supported: false });
  assert.equal(h.speak(), null);
  assert.deepEqual(h.events, ['error:unsupported', 'end']);
});

for (const operation of ['getVoices', 'speak']) {
  test(`a thrown ${operation} device API resets the session without escaping the tap handler`, () => {
    const h = engine({ throws: operation });
    assert.doesNotThrow(() => h.speak());
    assert.deepEqual(h.events, ['error:synthesis-failed', 'end']);
    assert.equal(h.timers.size, 0);
  });
}

test('speech that never starts times out once and cannot revive through a late browser event', () => {
  const h = engine();
  h.speak(); h.advance(30_000);
  assert.deepEqual(h.events, ['error:start-timeout', 'end']);
  assert.equal(h.timers.size, 0);
  h.event(0, 'start'); h.event(0, 'end'); h.event(0, 'error', 'network');
  assert.deepEqual(h.events, ['error:start-timeout', 'end']);
});

test('actual playback clears the start watchdog and terminal callbacks fire once', () => {
  const h = engine();
  h.speak(); h.event(0, 'start'); h.advance(30_000);
  assert.deepEqual(h.events, ['start']);
  h.event(0, 'error', 'not-allowed'); h.event(0, 'end'); h.event(0, 'error', 'network');
  assert.deepEqual(h.events, ['start', 'error:not-allowed', 'end']);
  assert.equal(h.timers.size, 0);
});

test('cancel clears pending work and suppresses late start, end and error callbacks', () => {
  const h = engine(), controller = h.speak();
  controller.cancel(); controller.cancel(); h.advance(30_000);
  h.event(0, 'start'); h.event(0, 'end'); h.event(0, 'error', 'network');
  assert.deepEqual(h.events, []);
  assert.equal(h.timers.size, 0);
});

test('replacement isolates new playback from every stale callback of the cancelled session', () => {
  const h = engine();
  const old = h.speak(); old.cancel();
  h.speak({ text: 'ما السؤال التالي؟' });
  h.event(0, 'error', 'network'); h.event(0, 'start'); h.event(0, 'end');
  assert.deepEqual(h.events, []);
  h.event(1, 'start'); h.event(1, 'end');
  assert.deepEqual(h.events, ['start', 'end']);
  assert.equal(h.spoken.length, 2);
});

test('a new shared-engine session itself cancels a previous queued session', () => {
  const h = engine();
  h.speak({ text: ('اقرأ هذه الخطوة مع الطفل. ').repeat(30) });
  const count = h.spoken.length;
  h.speak({ text: 'سؤال آخر؟' });
  assert.ok(h.calls.includes('cancel'));
  for (let index = 0; index < count; index++) { h.event(index, 'start'); h.event(index, 'error', 'network'); h.event(index, 'end'); }
  assert.deepEqual(h.events, []);
  h.event(count, 'start'); h.event(count, 'end');
  assert.deepEqual(h.events, ['start', 'end']);
});

test('playback always chooses an installed local voice instead of a remote service', () => {
  const h = engine();
  h.speak();
  assert.equal(h.spoken[0].voice, localArabic);
  h.event(0, 'start'); h.event(0, 'end');
  assert.deepEqual(h.events, ['start', 'end']);
});

test('native interruption and cancellation finish without presenting a playback error', () => {
  for (const reason of ['canceled', 'interrupted']) {
    const h = engine(); h.speak(); h.event(0, 'error', reason);
    assert.deepEqual(h.events, ['end']);
    assert.equal(h.timers.size, 0);
  }
});

test('native interruption of long instructions cancels the remaining queue without an error', () => {
  const h = engine();
  h.speak({ text: ('اقرأ هذه الخطوة مع الطفل. ').repeat(30) });
  assert.ok(h.spoken.length > 2);
  h.event(0, 'start'); h.event(0, 'error', 'interrupted');
  assert.ok(h.calls.includes('cancel'), 'queued instructions do not continue after native interruption');
  for (let index = 1; index < h.spoken.length; index++) { h.event(index, 'start'); h.event(index, 'end'); }
  assert.deepEqual(h.events, ['start', 'end']);
  assert.equal(h.timers.size, 0);
});

test('a failed local voice resets cleanly and the next tap stays on the free device engine', () => {
  const h = engine();
  h.speak();
  assert.equal(h.spoken[0].voice, localArabic);
  h.event(0, 'error', 'network');
  assert.equal(h.spoken.length, 1, 'network failure does not replay asynchronously outside the tap');
  assert.deepEqual(h.events, ['error:network', 'end']);
  h.speak();
  assert.equal(h.spoken.length, 2);
  assert.equal(h.spoken[1].voice, localArabic);
  h.event(1, 'start'); h.event(1, 'end');
  assert.deepEqual(h.events, ['error:network', 'end', 'start', 'end']);
});

test('a failed cancellation API cannot throw or re-enable cancelled speech callbacks', () => {
  const h = engine({ throws: 'cancel' });
  const controller = h.speak();
  assert.doesNotThrow(() => controller?.cancel());
  h.advance(30_000); h.event(0, 'end');
  assert.deepEqual(h.events, []);
});

test('long Kids instructions enqueue bounded word chunks synchronously and finish only after the last chunk', () => {
  const h = engine(), text = Array.from({ length: 160 }, (_, i) => `التعليمة${i + 1}`).join(' ');
  h.speak({ text });
  assert.ok(h.spoken.length > 2, 'long instructions do not depend on one fragile native utterance');
  assert.equal(h.spoken.map(item => item.text).join(' '), text, 'every authored word is retained once and in order');
  assert.ok(h.spoken.every(item => item.text.length <= 300), 'ordinary word chunks remain small enough for mobile synthesis');
  for (let index = 0; index < h.spoken.length; index++) {
    h.event(index, 'start');
    if (index > 0) assert.deepEqual(h.events, ['start'], 'subsequent chunks do not repeat playback announcements');
    h.event(index, 'end');
    assert.deepEqual(h.events, index === h.spoken.length - 1 ? ['start', 'end'] : ['start']);
  }
  assert.equal(h.timers.size, 0);
});

test('a failure in a queued long instruction cancels the rest without dropping or replaying text', () => {
  const h = engine(), controller = h.speak({ text: ('صِف الجسم ثم جرّب الخطوة التالية. ').repeat(40) });
  assert.ok(h.spoken.length > 2);
  const queued = h.spoken.length;
  h.event(0, 'start'); h.event(0, 'end'); h.event(1, 'error', 'network');
  assert.deepEqual(h.events, ['start', 'error:network', 'end']);
  for (let index = 1; index < queued; index++) { h.event(index, 'start'); h.event(index, 'end'); }
  controller.cancel(); h.advance(30_000);
  assert.deepEqual(h.events, ['start', 'error:network', 'end']);
  assert.equal(h.spoken.length, queued);
  assert.equal(h.timers.size, 0);
});

test('a single unusually long word survives intact and cancellation stops its complete queue', () => {
  const h = engine(), word = 'أ'.repeat(400), controller = h.speak({ text: `اقرأ ${word} ثم توقّف.` });
  assert.equal(h.spoken.map(item => item.text).join(' '), `اقرأ ${word} ثم توقّف.`);
  assert.ok(h.spoken.some(item => item.text.includes(word)), 'word boundaries are preserved even for exceptional input');
  controller.cancel();
  for (let index = 0; index < h.spoken.length; index++) { h.event(index, 'start'); h.event(index, 'end'); }
  h.advance(30_000);
  assert.deepEqual(h.events, []);
});
