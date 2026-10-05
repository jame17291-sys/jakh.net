import assert from 'node:assert/strict';

const ACTIVITY = 'kids-3-4-language-01';
const speechPath = pathname => /^\/speech-quality(?:\.[a-f0-9]{16})?\.js$/u.test(pathname);

async function installSpeech(context, { voices = 'normal', autoStart = true } = {}) {
  await context.addInitScript(({ mode, starts }) => {
    const voiceList = mode === 'empty' ? [] : [
      { name: 'English device', voiceURI: 'english-device', lang: 'en-US', localService: true },
      ...(mode === 'english-only' ? [] : [
        { name: 'Arabic device', voiceURI: 'arabic-device', lang: 'ar-SA', localService: true },
        { name: 'Microsoft Salma Online (Natural)', voiceURI: 'arabic-natural', lang: 'ar-EG', localService: false },
      ]),
    ];
    let activation = false;
    // Mark only the synchronous invocation of a real click listener. Browsers
    // may run a microtask checkpoint between listeners, so a capture-listener
    // microtask would incorrectly reject even a synchronous delegated handler.
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const wrappedListeners = new WeakMap();
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type !== 'click' || !listener) return nativeAdd.call(this, type, listener, options);
      let wrappers = wrappedListeners.get(this);
      if (!wrappers) wrappedListeners.set(this, wrappers = new Map());
      let wrapped = wrappers.get(listener);
      if (!wrapped) {
        wrapped = function(event) {
          const previous = activation;
          activation = true;
          try { return typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event); }
          finally { activation = previous; }
        };
        wrappers.set(listener, wrapped);
      }
      return nativeAdd.call(this, type, wrapped, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      return nativeRemove.call(this, type, type === 'click' ? wrappedListeners.get(this)?.get(listener) || listener : listener, options);
    };
    const utterances = [], records = [];
    window.__speech = {
      records, cancelled: 0,
      event(index, type, error) { utterances[index]?.[`on${type}`]?.({ error }); },
    };
    class Utterance { constructor(text) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => voiceList,
      addEventListener() {}, removeEventListener() {}, resume() {},
      cancel() { window.__speech.cancelled++; },
      speak(utterance) {
        const index = utterances.length;
        utterances.push(utterance);
        records.push({ text: utterance.text, voice: utterance.voice?.name || null, lang: utterance.lang, rate: utterance.rate, pitch: utterance.pitch, activation });
        if (!activation) queueMicrotask(() => window.__speech.event(index, 'error', 'not-allowed'));
        else if (starts) queueMicrotask(() => window.__speech.event(index, 'start'));
      },
    } });
  }, { mode: voices, starts: autoStart });
}

function route(kind, lang) {
  if (kind === 'card') return lang === 'ar' ? '/ar/topics/science/' : '/science';
  return `${lang === 'ar' ? '/ar/topics' : ''}/kids-riddles/activities/${ACTIVITY}/`;
}

async function readyControl(page, kind) {
  const selector = kind === 'card' ? '.card-audio-btn' : '[data-kids-speak]';
  const control = page.locator(selector).first();
  await control.waitFor();
  await page.waitForFunction(({ selector, kind }) => {
    const control = document.querySelector(selector);
    // A committed WebKit document can expose authored buttons before its
    // deferred Kids module starts. Wait until it has preserved the read label,
    // then check the completed warm-up state rather than a pre-bootstrap frame.
    return control && (kind !== 'kids' || Boolean(control.dataset.kidsSpeakLabel))
      && !control.disabled && control.getAttribute('aria-busy') !== 'true';
  }, { selector, kind });
  return control;
}

async function assertStopped(control, kind, originalLabel) {
  if (kind === 'card') {
    assert.equal(await control.getAttribute('aria-label'), originalLabel);
    assert.equal(await control.evaluate(button => button.classList.contains('playing')), false);
  } else {
    assert.equal(await control.getAttribute('aria-pressed'), 'false');
    assert.equal(await control.textContent(), originalLabel);
  }
  assert.equal(await control.isDisabled(), false, 'a failed or stopped voice can be retried');
}

export async function runSpeechRegressions({ browser, createContext, runTest, trackPageErrors, baseUrl, artifactManifest, navigationReadyEvent }) {
  const options = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' };
  const open = async ({ kind = 'card', lang = 'ar', voices = 'normal', autoStart = true } = {}) => {
    const context = await createContext(browser, options);
    await installSpeech(context, { voices, autoStart });
    const page = await context.newPage(), noErrors = trackPageErrors(page);
    await page.goto(`${baseUrl}${route(kind, lang)}`, { waitUntil: navigationReadyEvent });
    const control = await readyControl(page, kind);
    const label = kind === 'card' ? await control.getAttribute('aria-label') : await control.textContent();
    return { context, page, control, label, noErrors };
  };

  await runTest('mobile read-aloud waits visibly for its engine and the first enabled tap retains activation', async () => {
    const context = await createContext(browser, options);
    await installSpeech(context);
    let releaseModule;
    const moduleGate = new Promise(resolve => { releaseModule = resolve; });
    await context.route(url => speechPath(url.pathname), async request => { await moduleGate; await request.continue(); });
    const page = await context.newPage(), noErrors = trackPageErrors(page);
    try {
      await page.goto(`${baseUrl}/ar/topics/science/`, { waitUntil: navigationReadyEvent });
      const button = page.locator('.card-audio-btn').first();
      await button.waitFor();
      assert.equal(await button.isDisabled(), true);
      assert.equal(await button.getAttribute('aria-busy'), 'true');
      assert.ok((await button.textContent()).trim(), 'loading has a visible indicator');
      assert.equal(await page.locator('[data-action="flip"]').first().isDisabled(), false, 'practice stays available while speech loads');
      await button.evaluate(control => control.click());
      assert.equal(await page.evaluate(() => window.__speech.records.length), 0);
      releaseModule();
      await readyControl(page, 'card');
      await button.click();
      await page.waitForFunction(() => window.__speech.records.length > 0);
      assert.ok((await page.evaluate(() => window.__speech.records)).every(record => record.activation), 'the first playable tap speaks within its gesture');
      const path = artifactManifest?.fingerprints?.['/speech-quality.js'] || '/speech-quality.js';
      assert.equal(await page.evaluate(path => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === path), path), true, 'the deployed dependency is the pinned speech engine');
      await button.click();
      assert.equal(await button.getAttribute('aria-label'), 'اقرأ بصوت عالٍ');
      noErrors();
    } finally { releaseModule(); await context.close(); }
  });

  await runTest('mobile read-aloud recovers from one failed pinned module load without playing outside a tap', async () => {
    const context = await createContext(browser, options);
    await installSpeech(context);
    const requests = [];
    let releaseRetry;
    const retryGate = new Promise(resolve => { releaseRetry = resolve; });
    await context.route(url => speechPath(url.pathname), async request => {
      requests.push(new URL(request.request().url()));
      if (requests.length === 1) await request.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary test outage' });
      else { await retryGate; await request.continue(); }
    });
    const page = await context.newPage(), noErrors = trackPageErrors(page);
    try {
      await page.goto(`${baseUrl}/ar/topics/science/`, { waitUntil: navigationReadyEvent });
      const control = await readyControl(page, 'card');
      assert.equal(requests.length, 1);
      assert.equal(await page.evaluate(() => window.__speech.records.length), 0);
      await control.click();
      assert.equal(await control.isDisabled(), true);
      assert.equal(await control.getAttribute('aria-busy'), 'true');
      assert.ok((await control.textContent()).trim());
      assert.equal(await page.locator('[data-action="flip"]').first().isDisabled(), false);
      releaseRetry();
      await readyControl(page, 'card');
      assert.equal(requests.length, 2);
      const path = artifactManifest?.fingerprints?.['/speech-quality.js'] || '/speech-quality.js';
      assert.ok(requests.every(url => url.pathname === path), 'retry keeps the same version-pinned dependency');
      assert.equal(requests[0].search, '');
      assert.equal(requests[1].searchParams.get('retry'), '1');
      assert.equal(await page.evaluate(() => window.__speech.records.length), 0, 'a recovered load does not start speech asynchronously');
      await control.click();
      assert.ok((await page.evaluate(() => window.__speech.records)).every(record => record.activation));
      assert.ok(await page.evaluate(() => window.__speech.records.length > 0));
      await control.click();
      await assertStopped(control, 'card', 'اقرأ بصوت عالٍ');
      noErrors();
    } finally { releaseRetry(); await context.close(); }
  });

  await runTest('repeated mobile speech-module failures provide localized reload guidance and stop retrying', async () => {
    for (const lang of ['en', 'ar']) {
      const context = await createContext(browser, options);
      await installSpeech(context);
      let requests = 0;
      await context.route(url => speechPath(url.pathname), async request => {
        requests++;
        await request.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary test outage' });
      });
      const page = await context.newPage(), noErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}${route('card', lang)}`, { waitUntil: navigationReadyEvent });
        const control = await readyControl(page, 'card');
        await control.click();
        await readyControl(page, 'card');
        assert.equal(requests, 2);
        await control.click();
        await control.click();
        assert.equal(requests, 2, 'later taps do not cause an endless module retry loop');
        const feedback = await page.locator('#toast').textContent();
        assert.match(feedback, lang === 'ar' ? /حدّث|تحديث|أعد تحميل|إعادة تحميل/u : /reload|refresh/iu);
        assert.equal(await page.evaluate(() => window.__speech.records.length), 0);
        assert.equal(await control.isDisabled(), false);
        assert.equal(await page.locator('[data-action="flip"]').first().isDisabled(), false);
        noErrors();
      } finally { await context.close(); }
    }
  });

  await runTest('Kids speech-module recovery leaves Save and Complete usable while retry loads', async () => {
    for (const lang of ['en', 'ar']) {
      const context = await createContext(browser, options);
      await installSpeech(context);
      const requests = [];
      let releaseRetry;
      const retryGate = new Promise(resolve => { releaseRetry = resolve; });
      await context.route(url => speechPath(url.pathname), async request => {
        requests.push(new URL(request.request().url()));
        if (requests.length === 1) await request.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary test outage' });
        else { await retryGate; await request.continue(); }
      });
      const page = await context.newPage(), noErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}${route('kids', lang)}`, { waitUntil: navigationReadyEvent });
        await page.waitForFunction(() => document.body.classList.contains('kids-ready'));
        const control = await readyControl(page, 'kids'), label = await control.textContent();
        assert.equal(requests.length, 1);
        await control.click();
        assert.equal(await control.isDisabled(), true);
        assert.equal(await control.getAttribute('aria-busy'), 'true');
        const save = page.locator(`[data-kids-save="${ACTIVITY}"]`).first();
        const complete = page.locator(`[data-kids-complete="${ACTIVITY}"]`).first();
        assert.equal(await save.isDisabled(), false);
        assert.equal(await complete.isDisabled(), false);
        await save.click();
        assert.equal(await save.getAttribute('aria-pressed'), 'true');
        await complete.click();
        assert.equal(await complete.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => window.__speech.records.length), 0);
        releaseRetry();
        await readyControl(page, 'kids');
        const path = artifactManifest?.fingerprints?.['/speech-quality.js'] || '/speech-quality.js';
        assert.equal(requests.length, 2);
        assert.ok(requests.every(url => url.pathname === path));
        assert.equal(requests[1].searchParams.get('retry'), '1');
        assert.equal(await page.evaluate(() => window.__speech.records.length), 0, 'a recovered Kids module waits for another tap');
        await control.click();
        const records = await page.evaluate(() => window.__speech.records);
        assert.ok(records.length > 1);
        assert.ok(records.every(record => record.activation));
        await control.click();
        await assertStopped(control, 'kids', label);
        assert.equal(await complete.getAttribute('aria-pressed'), 'true');
        noErrors();
      } finally { releaseRetry(); await context.close(); }
    }
  });

  await runTest('Kids filters, saved activities and completed weekly plans survive repeated speech-module outages', async () => {
    for (const lang of ['en', 'ar']) {
      const context = await createContext(browser, options);
      await installSpeech(context);
      let requests = 0;
      await context.route(url => speechPath(url.pathname), async request => {
        requests++;
        await request.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary test outage' });
      });
      const page = await context.newPage(), noErrors = trackPageErrors(page);
      const base = lang === 'ar' ? '/ar/topics/kids-riddles' : '/kids-riddles';
      try {
        await page.goto(`${baseUrl}${base}${lang === 'ar' ? '/' : ''}`, { waitUntil: navigationReadyEvent });
        await page.waitForFunction(() => document.body.classList.contains('kids-ready'));
        await page.locator('[data-kids-filters] select[name="age"]').selectOption('3-4');
        await page.locator('[data-kids-filters] select[name="area"]').selectOption('language');
        await page.waitForFunction(() => document.querySelector('[data-kids-count]')?.textContent.includes('20'));
        assert.ok((await page.locator('[data-activity-card]:visible').evaluateAll(cards => cards.map(card => card.dataset.activityId))).every(id => id.startsWith('kids-3-4-language-')));
        const save = page.locator(`[data-kids-save="${ACTIVITY}"]`).first();
        await save.click();
        assert.equal(await save.getAttribute('aria-pressed'), 'true');
        await page.goto(`${baseUrl}${route('kids', lang)}`, { waitUntil: navigationReadyEvent });
        await page.waitForFunction(() => document.body.classList.contains('kids-ready'));
        const control = await readyControl(page, 'kids');
        assert.equal(await page.locator(`[data-kids-save="${ACTIVITY}"]`).first().getAttribute('aria-pressed'), 'true');
        await page.locator(`[data-kids-complete="${ACTIVITY}"]`).first().click();
        await page.locator(`[data-kids-day="${ACTIVITY}"]`).first().selectOption('tue');
        await page.locator(`[data-kids-add="${ACTIVITY}"]`).first().click();
        await control.click();
        await readyControl(page, 'kids');
        await control.click();
        const failedAttempts = requests;
        await control.click();
        assert.equal(requests, failedAttempts, 'after two failed loads further taps only explain how to recover');
        const feedback = await page.locator('[data-kids-speech-feedback]').textContent();
        assert.match(feedback, lang === 'ar' ? /حدّث|تحديث|أعد تحميل|إعادة تحميل/u : /reload|refresh/iu);
        assert.equal(await page.evaluate(() => window.__speech.records.length), 0);
        await page.goto(`${baseUrl}${base}/toolkit/`, { waitUntil: navigationReadyEvent });
        await page.waitForFunction(() => document.body.classList.contains('kids-ready'));
        const planned = page.locator('[data-kids-planner-day="tue"] .kids-planner-item');
        assert.equal(await planned.count(), 1);
        assert.equal(await planned.locator(`[data-kids-complete="${ACTIVITY}"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(await planned.evaluate(item => item.classList.contains('is-complete')), true);
        assert.equal(await page.locator('[data-kids-saved-list] .kids-saved-item').count(), 1);
        noErrors();
      } finally { await context.close(); }
    }
  });

  await runTest('the first enabled Kids read tap works while the catalog is slow or unavailable', async () => {
    for (const lang of ['en', 'ar']) for (const failure of [false, true]) {
      const context = await createContext(browser, options);
      await installSpeech(context);
      let releaseCatalog;
      const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
      await context.route(url => /^\/data\/kids\/catalog(?:\.[a-f0-9]{16})?\.json$/u.test(url.pathname), async request => {
        if (failure) await request.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        else { await catalogGate; await request.continue(); }
      });
      const page = await context.newPage(), noErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}${route('kids', lang)}`, { waitUntil: navigationReadyEvent });
        const control = await readyControl(page, 'kids'), label = await control.textContent();
        assert.equal(await page.evaluate(() => document.body.classList.contains('kids-ready')), false, 'the data-dependent toolkit has not initialized');
        assert.equal(await page.locator('#activity-instructions').isVisible(), true);
        await control.click();
        const records = await page.evaluate(() => window.__speech.records);
        assert.ok(records.length > 1, 'static instructions can be read without the catalog');
        assert.ok(records.every(record => record.activation), 'the first enabled tap speaks synchronously');
        assert.equal(await control.getAttribute('aria-pressed'), 'true');
        await control.click();
        await assertStopped(control, 'kids', label);
        if (failure) assert.equal(await page.locator(`[data-kids-save="${ACTIVITY}"]`).first().isDisabled(), true, 'unavailable tools keep their honest fallback while speech works');
        else {
          releaseCatalog();
          await page.waitForFunction(() => document.body.classList.contains('kids-ready'));
          assert.equal(await page.locator(`[data-kids-save="${ACTIVITY}"]`).first().isDisabled(), false);
        }
        noErrors();
      } finally { releaseCatalog(); await context.close(); }
    }
  });

  await runTest('mobile Arabic cards and Kids use the same voice and retain every instruction with readable boundaries', async () => {
    const results = [];
    for (const kind of ['card', 'kids']) {
      const h = await open({ kind });
      try {
        await h.control.click();
        await h.page.waitForFunction(() => window.__speech.records.length > 0);
        const records = await h.page.evaluate(() => window.__speech.records);
        assert.ok(records.every(record => record.activation), `${kind}: every chunk was queued during the original tap`);
        assert.ok(records.every(record => record.lang === 'ar-EG' && record.voice === 'Microsoft Salma Online (Natural)'));
        results.push({ voice: records[0].voice, lang: records[0].lang, rate: records[0].rate, pitch: records[0].pitch });
        if (kind === 'card') {
          assert.equal(records.map(record => record.text).join(' '), 'من يُشتهر بقانون الجاذبية الكونية بعد مشاهدة سقوط تفاحة؟');
          assert.equal(await h.control.getAttribute('aria-label'), 'إيقاف');
        } else {
          const spoken = records.map(record => record.text).join(' ');
          assert.ok(records.length > 1, 'real Kids instructions are split into a complete mobile queue');
          assert.match(spoken, /ما الذي نتدرّب عليه؟\s+التدرّب على تسمية الأشياء ووصف استخداماتها\./u);
          assert.match(spoken, /قبل أن تبدأ[.،؛؟]?\s+ضع ثلاثة أشياء مألوفة وآمنة في الحقيبة\./u);
          assert.match(spoken, /صِف الملعقة:?[،.]?\s+نستخدمها لتناول الحساء/u);
          assert.doesNotMatch(spoken, /تلميح صغير|الإجابة وما نلاحظه|أوقف القراءة/u, 'closed hints and controls are omitted');
          assert.equal(await h.control.getAttribute('aria-pressed'), 'true');
        }
        for (let index = 0; index < records.length - 1; index++) await h.page.evaluate(index => window.__speech.event(index, 'end'), index);
        if (kind === 'kids' && records.length > 1) assert.equal(await h.control.getAttribute('aria-pressed'), 'true', 'reading stays active across chunk boundaries');
        await h.page.evaluate(index => window.__speech.event(index, 'end'), records.length - 1);
        await assertStopped(h.control, kind, h.label);
        h.noErrors();
      } finally { await h.context.close(); }
    }
    assert.deepEqual(results[0], results[1], 'sections do not apply different Arabic voice or speed policies');
  });

  await runTest('mobile speech errors reset English and Arabic controls and a later tap retries locally', async () => {
    for (const kind of ['card', 'kids']) for (const lang of ['en', 'ar']) {
      const h = await open({ kind, lang });
      try {
        await h.control.click();
        await h.page.waitForFunction(() => window.__speech.records.length > 0);
        const count = await h.page.evaluate(() => window.__speech.records.length);
        await h.page.evaluate(() => window.__speech.event(0, 'error', 'network'));
        await assertStopped(h.control, kind, h.label);
        assert.equal(await h.page.evaluate(() => window.__speech.records.length), count, 'no automatic replay occurs after failure');
        const feedback = kind === 'kids' ? await h.page.locator('[data-kids-status]').textContent() : await h.page.locator('#toast').textContent();
        assert.match(feedback, lang === 'ar' ? /[\u0600-\u06ff]/u : /voice|audio|read|play|speech/iu);
        await h.control.click();
        const records = await h.page.evaluate(() => window.__speech.records);
        assert.ok(records.length > count);
        assert.equal(records[count].voice, lang === 'ar' ? 'Arabic device' : 'English device');
        assert.ok(records.slice(count).every(record => record.activation));
        await h.control.click();
        await assertStopped(h.control, kind, h.label);
        h.noErrors();
      } finally { await h.context.close(); }
    }
  });

  await runTest('mobile stop and pagehide suppress stale speech events in cards and Kids', async () => {
    for (const kind of ['card', 'kids']) {
      const h = await open({ kind });
      try {
        await h.control.click();
        await h.page.waitForFunction(() => window.__speech.records.length > 0);
        const count = await h.page.evaluate(() => window.__speech.records.length);
        await h.control.click();
        await assertStopped(h.control, kind, h.label);
        await h.control.click();
        const total = await h.page.evaluate(() => window.__speech.records.length);
        assert.ok(total > count);
        await h.page.evaluate(count => { for (let i = 0; i < count; i++) { window.__speech.event(i, 'error', 'network'); window.__speech.event(i, 'end'); } }, count);
        if (kind === 'card') assert.equal(await h.control.getAttribute('aria-label'), 'إيقاف');
        else assert.equal(await h.control.getAttribute('aria-pressed'), 'true');
        await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        await assertStopped(h.control, kind, h.label);
        await h.page.evaluate(() => { for (let i = 0; i < window.__speech.records.length; i++) { window.__speech.event(i, 'start'); window.__speech.event(i, 'error', 'network'); window.__speech.event(i, 'end'); } });
        await assertStopped(h.control, kind, h.label);
        assert.equal(await h.page.evaluate(() => window.__speech.records.length), total);
        h.noErrors();
      } finally { await h.context.close(); }
    }
  });

  await runTest('mobile Arabic speech uses the immediate language hint while voices initialize and explains a missing Arabic voice', async () => {
    for (const kind of ['card', 'kids']) for (const voices of ['empty', 'english-only']) {
      const h = await open({ kind, voices });
      try {
        await h.control.click();
        const records = await h.page.evaluate(() => window.__speech.records);
        if (voices === 'empty') {
          assert.ok(records.length > 0);
          assert.ok(records.every(record => /^ar(?:-|$)/iu.test(record.lang) && record.activation));
          await h.control.click();
        } else {
          assert.equal(records.length, 0, 'Arabic text is never handed to an English voice');
          const feedback = kind === 'kids' ? await h.page.locator('[data-kids-status]').textContent() : await h.page.locator('#toast').textContent();
          assert.match(feedback, /عربي/u);
        }
        await assertStopped(h.control, kind, h.label);
        h.noErrors();
      } finally { await h.context.close(); }
    }
  });
}
