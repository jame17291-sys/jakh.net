import assert from 'node:assert/strict';

async function reached(promise, label) {
  let timer;
  try {
    await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not reach the fixture`)), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

async function expectFeedback(page, id, message, tone = '') {
  await page.waitForFunction(({ id, message, tone }) => {
    const node = document.getElementById(id);
    return node?.textContent === message && (node.dataset.tone || '') === tone;
  }, { id, message, tone });
  const status = page.locator(`#${id}`);
  await status.scrollIntoViewIfNeeded();
  assert.equal(await status.isVisible(), true);
  assert.equal(await status.getAttribute('role'), 'status');
  assert.equal(await status.evaluate(node => {
    const box = node.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return document.getElementById('authModal').contains(node) && (top === node || node.contains(top));
  }), true, `${id}: feedback must be above the Profile backdrop`);
  // The site currently uses a light palette, including with a dark OS preference.
  // Check computed foreground/background rather than assuming either theme's colors.
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const ratio = await status.evaluate(node => {
      const rgb = value => value.match(/[\d.]+/g).map(Number);
      const luminance = channels => channels.slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = rgb(getComputedStyle(node).color);
      let parent = node;
      let background;
      while (parent) {
        const candidate = rgb(getComputedStyle(parent).backgroundColor);
        if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
        parent = parent.parentElement;
      }
      if (!background) throw new Error('No opaque Profile background found');
      const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
      return (values[1] + 0.05) / (values[0] + 0.05);
    });
    assert.ok(ratio >= 4.5, `${id} ${tone || 'pending'} under ${colorScheme}: contrast ${ratio.toFixed(2)} must be at least 4.5:1`);
  }
}

// Synthetic accounts and intercepted mutations only; no real subscription or credential is used.
export async function runProfileFeedbackRegressions({ browser, baseUrl, createContext, setConsent, waitUntil }) {
  for (const language of ['en', 'ar']) {
    const copy = language === 'ar' ? {
      saving: 'جارٍ حفظ الصورة الرمزية…', invalid: 'هذه الصورة الرمزية غير متاحة.',
      saved: 'تم تحديث الصورة الرمزية!', loading: 'جارٍ تحميل حماية الحساب…',
      loadFailed: 'تعذّر تحميل حماية الحساب. تحقق من الاتصال وحدّث الصفحة ثم حاول مجدداً.',
    } : {
      saving: 'Saving avatar…', invalid: 'That avatar is not available.',
      saved: 'Avatar updated!', loading: 'Loading account security…',
      loadFailed: 'Could not load account security. Check your connection, refresh this page and try again.',
    };
    const context = await createContext(browser, { viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }, {
      profile: { id: 'profile-feedback-owner', username: 'ProfileFixtureOwner', role: 'OWNER', avatar: '👤', progress: [], favorites: [] },
    });
    await setConsent(context);
    let avatarPending;
    let avatarRequests = 0;
    let modulePending;
    let moduleRequests = 0;
    let securityRequests = 0;
    const headers = request => ({
      'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Allow-Methods': 'PUT, POST, GET, OPTIONS',
      'Access-Control-Allow-Origin': request.headers().origin || baseUrl,
      'Access-Control-Allow-Private-Network': 'true', Vary: 'Origin',
    });
    await context.route('**/api/user/avatar', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: headers(request) });
      assert.equal(request.method(), 'PUT');
      avatarRequests++;
      const pending = avatarPending;
      assert.ok(pending, 'Unexpected avatar mutation');
      pending.entered.resolve();
      await pending.release.promise;
      await route.fulfill({ status: pending.status, headers: headers(request), contentType: 'application/json', body: JSON.stringify(pending.body) });
    });
    await context.route(/\/auth-security(?:\.[a-f0-9]+)?\.js(?:\?|$)/u, async route => {
      moduleRequests++;
      const pending = modulePending;
      assert.ok(pending, 'Unexpected security module load');
      pending.entered.resolve();
      await pending.release.promise;
      if (pending.fail) await route.abort('failed');
      else await route.continue();
    });
    await context.route('**/api/user/security', async route => {
      securityRequests++;
      await route.fulfill({ status: 500, headers: headers(route.request()), contentType: 'application/json', body: '{}' });
    });
    await context.route('**/api/auth/logout', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: headers(request) });
      await route.fulfill({ status: 200, headers: headers(request), contentType: 'application/json', body: '{"success":true}' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function openProfile() {
      await page.locator('#adminNavBtn').waitFor({ state: 'visible' });
      await page.locator('#openAuthBtn').click();
      await page.locator('#signedInAccountPanel').waitFor({ state: 'visible' });
    }
    try {
      await page.goto(`${baseUrl}${language === 'ar' ? '/ar/mind-lab/' : '/mind-lab'}`, { waitUntil });
      await openProfile();
      await page.locator('#currentPassword').fill('Fixture-retained-password-42');
      await page.locator('#recoveryRotatePassword').fill('Fixture-retained-recovery-42');
      const choice = page.locator('.avatar-btn[data-emoji="🦊"]');
      for (const response of [
        { status: 400, body: { code: 'INVALID_AVATAR' }, message: copy.invalid, tone: 'error' },
        { status: 200, body: { success: true }, message: copy.saved, tone: 'success' },
      ]) {
        const before = avatarRequests;
        avatarPending = { ...response, entered: Promise.withResolvers(), release: Promise.withResolvers() };
        await choice.focus();
        await page.keyboard.press('Enter');
        await reached(avatarPending.entered.promise, 'Avatar request');
        await expectFeedback(page, 'avatarStatus', copy.saving);
        assert.equal(await page.locator('.avatar-btn:not(:disabled)').count(), 0);
        assert.equal(await page.locator('#avatarSelector').getAttribute('aria-busy'), 'true');
        await choice.evaluate(node => node.click());
        assert.equal(avatarRequests, before + 1);
        avatarPending.release.resolve();
        await expectFeedback(page, 'avatarStatus', response.message, response.tone);
        assert.equal(await page.locator('.avatar-btn:disabled').count(), 0);
        assert.equal(await page.locator('#avatarSelector').getAttribute('aria-busy'), null);
        assert.equal(await choice.evaluate(node => node === document.activeElement), true);
        assert.equal(await page.locator('#profileAvatar').innerText(), response.status === 200 ? '🦊' : '👤');
        assert.equal(await choice.getAttribute('aria-pressed'), String(response.status === 200));
        assert.equal(await page.locator('#currentPassword').inputValue(), 'Fixture-retained-password-42');
        assert.equal(await page.locator('#recoveryRotatePassword').inputValue(), 'Fixture-retained-recovery-42');
      }

      modulePending = { fail: true, entered: Promise.withResolvers(), release: Promise.withResolvers() };
      const securityButton = page.locator('#adminSecurityBtn');
      await securityButton.click();
      await reached(modulePending.entered.promise, 'Security module');
      await expectFeedback(page, 'adminSecurityStatus', copy.loading);
      assert.equal(await securityButton.isDisabled(), true);
      assert.equal(await securityButton.getAttribute('aria-busy'), 'true');
      await securityButton.evaluate(node => node.click());
      assert.equal(moduleRequests, 1);
      modulePending.release.resolve();
      await expectFeedback(page, 'adminSecurityStatus', copy.loadFailed, 'error');
      assert.equal(await securityButton.isEnabled(), true);
      assert.equal(await securityButton.getAttribute('aria-busy'), null);
      assert.equal(await securityButton.evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator('#signedInAccountPanel').isVisible(), true);
      assert.equal(securityRequests, 0);

      // A fresh document resets the failed module cache; a dismissed import must
      // not close the new Profile or start authenticator setup when it finishes.
      modulePending = { fail: false, entered: Promise.withResolvers(), release: Promise.withResolvers() };
      await page.reload({ waitUntil });
      await openProfile();
      await securityButton.click();
      await reached(modulePending.entered.promise, 'Delayed security module');
      await page.locator('#authModal .modal-head [data-close-modal="auth"]').click();
      await openProfile();
      assert.equal(await securityButton.isDisabled(), true);
      modulePending.release.resolve();
      await page.waitForFunction(() => !document.getElementById('adminSecurityBtn')?.disabled);
      assert.equal(await page.locator('#signedInAccountPanel').isVisible(), true);
      assert.equal(await page.locator('.auth-security-dialog').count(), 0);
      assert.equal(securityRequests, 0);

      // A late avatar response must not restore or mutate a signed-out account.
      avatarPending = { status: 200, body: { success: true }, entered: Promise.withResolvers(), release: Promise.withResolvers() };
      await page.locator('.avatar-btn[data-emoji="🦉"]').click();
      await reached(avatarPending.entered.promise, 'Avatar request before sign-out');
      await page.locator('#logoutBtn').click();
      await page.locator('#authModal').waitFor({ state: 'hidden' });
      avatarPending.release.resolve();
      await page.waitForFunction(() => !document.getElementById('avatarSelector')?.hasAttribute('aria-busy'));
      await page.locator('#openAuthBtn').click();
      await page.locator('#authForm').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#signedInAccountPanel').count(), 0);
      assert.deepEqual(errors, [], `${language}: Profile feedback emitted browser errors`);
    } finally {
      avatarPending?.release.resolve();
      modulePending?.release.resolve();
      await context.close();
    }
  }
}
