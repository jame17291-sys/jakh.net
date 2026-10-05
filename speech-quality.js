const voiceLanguage = voice => String(voice?.lang || '').replaceAll('_', '-').toLowerCase();
const languageOf = lang => String(lang).toLowerCase().split(/[-_]/u)[0];
const voiceKey = voice => `${voiceLanguage(voice)}:${voice.voiceURI || voice.name}`;
const failedRemoteVoices = new Set();
let activeSpeech = null;

export function getBestVoice(voices, lang, { online = globalThis.navigator?.onLine !== false } = {}) {
  const language = languageOf(lang);
  if (!Array.isArray(voices) || !['ar', 'en'].includes(language)) return null;
  const candidates = voices.filter(voice => {
    const locale = voiceLanguage(voice);
    return (locale === language || locale.startsWith(`${language}-`)) && (online || voice.localService);
  });
  const score = voice => {
    const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
    return (/premium|enhanced|neural|natural|studio/u.test(name) ? 100 : 0)
      + (voice.localService ? 10 : 0) + (voice.default ? 5 : 0);
  };
  return candidates.sort((a, b) => score(b) - score(a))[0] || null;
}

export function prepareSpeechText(text, lang) {
  const clean = String(text || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (languageOf(lang) !== 'ar') return clean;
  return clean
    .replace(/([0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?)\s*\/\s*([0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?)/gu, (match, a, b, offset, source) => {
      const before = source.slice(0, offset), after = source.slice(offset + match.length);
      return /[0-9٠-٩.٫/]\s*$/u.test(before) || /^\s*[/0-9٠-٩.٫]/u.test(after) ? match : `${a} على ${b}`;
    })
    .replace(/&/gu, ' و ').replace(/×/gu, ' في ').replace(/÷/gu, ' مقسوم على ')
    .replace(/=/gu, ' يساوي ').replace(/\+/gu, ' زائد ').replace(/−/gu, ' ناقص ')
    .replace(/%/gu, ' بالمئة').replace(/[“”«»]/gu, '')
    .replace(/([،؛؟!])(?=\S)/gu, '$1 ').replace(/\s+/gu, ' ').trim();
}

// Warm voice discovery without moving playback outside the user's tap.
try { globalThis.speechSynthesis?.getVoices(); } catch { /* Report failures on playback. */ }

export function speakNaturally({ text, lang, onStart = () => {}, onEnd = () => {}, onError = () => {} }) {
  activeSpeech?.cancel();
  const synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance;
  const utterances = [];
  let stopped = false, started = false, timer;
  const cancelNative = () => { try { synthesis?.cancel(); } catch { /* UI cleanup still applies. */ } };
  const controller = { cancel() { finish(undefined, false); } };
  const finish = (error, notify = true) => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (activeSpeech === controller) activeSpeech = null;
    if (error || !notify) cancelNative();
    utterances.length = 0;
    if (notify) { try { if (error) onError(error); } finally { onEnd(); } }
  };
  if (!synthesis || typeof Utterance !== 'function') { finish('unsupported'); return null; }
  try {
    const content = prepareSpeechText(text, lang), language = languageOf(lang);
    if (!content) { finish(); return null; }
    const voices = synthesis.getVoices();
    const voice = getBestVoice(voices.filter(item => !failedRemoteVoices.has(voiceKey(item))), language);
    if (!['ar', 'en'].includes(language) || (voices.length && !voice)) { finish('voice-unavailable'); return null; }
    const chunks = [];
    let chunk = '';
    for (const word of content.split(' ')) {
      if (chunk && chunk.length + word.length > 220) { chunks.push(chunk); chunk = ''; }
      chunk += (chunk ? ' ' : '') + word;
    }
    if (chunk) chunks.push(chunk);
    for (const [index, part] of chunks.entries()) {
      const utterance = new Utterance(part);
      utterance.lang = voice?.lang.replaceAll('_', '-') || (language === 'ar' ? 'ar-SA' : 'en-US');
      if (voice) utterance.voice = voice;
      utterance.rate = language === 'ar' ? 0.92 : 0.98;
      utterance.pitch = 1;
      utterance.onstart = () => { if (!stopped && !started) { started = true; clearTimeout(timer); onStart(); } };
      utterance.onend = () => { if (index === chunks.length - 1) finish(); };
      utterance.onerror = event => {
        if (stopped) return;
        if (event.error === 'network' && voice && !voice.localService) failedRemoteVoices.add(voiceKey(voice));
        if (['canceled', 'interrupted'].includes(event.error)) { cancelNative(); finish(); }
        else finish(event.error || 'synthesis-failed');
      };
      utterances.push(utterance);
    }
    activeSpeech = controller;
    if (synthesis.paused && typeof synthesis.resume === 'function') synthesis.resume();
    timer = setTimeout(() => finish('start-timeout'), 8000);
    // Queue every retained utterance synchronously while user activation is valid.
    for (const utterance of [...utterances]) { if (stopped) break; synthesis.speak(utterance); }
  } catch { finish('synthesis-failed'); }
  return stopped ? null : controller;
}
