function voiceLanguage(voice) {
  return String(voice?.lang || '').replaceAll('_', '-').toLowerCase();
}

export function getBestVoice(voices, lang) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const isArabic = lang === 'ar';
  const languagePrefix = isArabic ? 'ar' : 'en';
  const localePriority = isArabic
    ? new Map([['ar-ae', 45], ['ar-sa', 40], ['ar-eg', 35], ['ar', 25]])
    : new Map([['en-us', 45], ['en-gb', 40], ['en-au', 35], ['en', 25]]);
  const candidates = voices.filter((voice) => {
    const locale = voiceLanguage(voice);
    return locale === languagePrefix || locale.startsWith(`${languagePrefix}-`);
  });
  if (!candidates.length) return null;

  function score(voice) {
    const locale = voiceLanguage(voice);
    const identity = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
    let value = 0;
    if (/premium|enhanced|neural|natural|studio/u.test(identity)) value += 500;
    if (/google|microsoft|apple|siri/u.test(identity)) value += 80;
    value += localePriority.get(locale) || (locale.startsWith(`${languagePrefix}-`) ? 20 : 0);
    if (voice.default) value += 15;
    if (voice.localService) value += 5;
    return value;
  }

  return [...candidates].sort((left, right) => (
    score(right) - score(left)
    || String(left.name || '').localeCompare(String(right.name || ''))
  ))[0];
}

export function prepareSpeechText(text, lang) {
  let prepared = String(text || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (lang !== 'ar') return prepared;
  return prepared
    .replace(/&/gu, ' و')
    .replace(/\//gu, ' أو ')
    .replace(/×/gu, ' في ')
    .replace(/÷/gu, ' مقسوم على ')
    .replace(/=/gu, ' يساوي ')
    .replace(/\+/gu, ' زائد ')
    .replace(/−/gu, ' ناقص ')
    .replace(/%/gu, ' بالمئة')
    .replace(/[:;]/gu, '،')
    .replace(/[“”«»]/gu, '')
    .replace(/([،؛؟!.])(?=\S)/gu, '$1 ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function speakNaturally({ text, lang, onEnd = () => {} }) {
  const synthesis = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!synthesis || typeof Utterance !== 'function') return null;

  let stopped = false;
  let voicesHandler = null;
  let voicesTimer = null;

  const clearVoiceWait = () => {
    if (voicesHandler) synthesis.removeEventListener('voiceschanged', voicesHandler);
    if (voicesTimer) clearTimeout(voicesTimer);
    voicesHandler = null;
    voicesTimer = null;
  };

  const controller = {
    cancel() {
      if (stopped) return;
      stopped = true;
      clearVoiceWait();
      synthesis.cancel();
    },
  };

  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearVoiceWait();
    onEnd();
  };

  const start = () => {
    if (stopped) return;
    clearVoiceWait();
    synthesis.cancel();
    const utterance = new Utterance(prepareSpeechText(text, lang));
    const voice = getBestVoice(synthesis.getVoices(), lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = lang === 'ar' ? 'ar-AE' : 'en-US';
    }
    // Arabic benefits from a little more breathing room than the browser
    // default, especially around interrogative phrasing and longer answers.
    utterance.rate = lang === 'ar' ? 0.92 : 0.98;
    utterance.pitch = 1;
    utterance.onend = finish;
    utterance.onerror = finish;
    synthesis.speak(utterance);
  };

  if (synthesis.getVoices().length) {
    start();
  } else {
    voicesHandler = start;
    synthesis.addEventListener('voiceschanged', voicesHandler);
    voicesTimer = setTimeout(start, 600);
  }
  return controller;
}
