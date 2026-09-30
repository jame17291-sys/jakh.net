import assert from 'node:assert/strict';

// All account data and responses are synthetic; this never changes a real credential.
export async function runPasswordChangeRegressions({ browser, baseUrl, createContext, setConsent, waitUntil }) {
  for (const language of ['en', 'ar']) {
    const copy = language === 'ar' ? {
      required: 'املأ حقلي كلمة المرور.',
      policy: 'استخدم كلمة مرور جديدة يتراوح طولها بين 15 و128 حرفًا.',
      updating: 'جارٍ تحديث كلمة المرور…',
      incorrect: 'كلمة المرور الحالية غير صحيحة.',
      mfa: 'استخدم «إعداد تطبيق المصادقة أو التحقق منه» في ملفك الشخصي لتأكيد وصولك إلى الإدارة، ثم حاول مجدداً.',
      success: 'تم تحديث كلمة المرور!',
      button: 'تحديث كلمة المرور',
    } : {
      required: 'Fill both password fields.',
      policy: 'Use a new password between 15 and 128 characters.',
      updating: 'Updating password…',
      incorrect: 'The current password is incorrect.',
      mfa: 'Use “Set up or verify authenticator” in your profile to verify admin access, then try again.',
      success: 'Password updated!',
      button: 'Update Password',
    };
    const context = await createContext(browser, { viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }, {
      profile: { id: 'password-fixture-owner', username: 'PasswordFixtureOwner', role: 'OWNER', avatar: '🛡️', progress: [], favorites: [] },
    });
    await setConsent(context);
    let submissions = 0;
    let pending;
    await context.route('**/api/user/password', async route => {
      const request = route.request();
      const headers = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': request.headers().origin || baseUrl,
        'Access-Control-Allow-Private-Network': 'true',
        Vary: 'Origin',
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      assert.equal(request.method(), 'POST');
      submissions++;
      const response = pending;
      assert.ok(response, 'Unexpected password mutation before valid submission');
      response.entered.resolve();
      await response.release.promise;
      await route.fulfill({ status: response.status, headers, contentType: 'application/json', body: JSON.stringify(response.body) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${baseUrl}${language === 'ar' ? '/ar/mind-lab/' : '/mind-lab'}`, { waitUntil });
      await page.locator('#adminNavBtn').waitFor({ state: 'visible' });
      await page.locator('#openAuthBtn').click();
      await page.locator('#signedInAccountPanel').waitFor({ state: 'visible' });
      const button = page.locator('#changePasswordBtn');
      const current = page.locator('#currentPassword');
      const replacement = page.locator('#newPassword');
      const status = page.locator('#changePasswordStatus');
      async function expectFeedback(message, tone) {
        await page.waitForFunction(({ message, tone }) => {
          const node = document.getElementById('changePasswordStatus');
          return node?.textContent === message && (node.dataset.tone || '') === tone;
        }, { message, tone });
        await status.scrollIntoViewIfNeeded();
        assert.equal(await status.isVisible(), true);
        assert.equal(await status.getAttribute('role'), 'status');
        assert.equal(await status.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return document.getElementById('authModal').contains(node) && (top === node || node.contains(top));
        }), true, `${language}: feedback must be readable above the modal backdrop`);
      }
      await button.click();
      await expectFeedback(copy.required, 'error');
      assert.equal(await current.getAttribute('aria-invalid'), 'true');
      await current.fill('Fixture-current-password-42');
      await button.click();
      await expectFeedback(copy.required, 'error');
      assert.equal(await replacement.getAttribute('aria-invalid'), 'true');
      await replacement.fill('short');
      await button.click();
      await expectFeedback(copy.policy, 'error');
      assert.equal(submissions, 0, 'Client validation must not send a password mutation');
      await replacement.fill('Fixture-replacement-password-84');

      for (const response of [
        { status: 401, body: { code: 'CURRENT_PASSWORD_INCORRECT' }, message: copy.incorrect, tone: 'error' },
        { status: 403, body: { code: 'MFA_REQUIRED' }, message: copy.mfa, tone: 'error' },
        { status: 200, body: { success: true }, message: copy.success, tone: 'success' },
      ]) {
        const before = submissions;
        pending = { ...response, entered: Promise.withResolvers(), release: Promise.withResolvers() };
        await button.click();
        let timer;
        try {
          await Promise.race([pending.entered.promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Password request did not reach the synthetic API')), 15_000);
          })]);
        } finally { clearTimeout(timer); }
        await expectFeedback(copy.updating, '');
        assert.equal(await button.isDisabled(), true);
        assert.equal(await button.getAttribute('aria-busy'), 'true');
        assert.equal(await current.isDisabled(), true);
        assert.equal(await replacement.isDisabled(), true);
        await button.evaluate(node => node.click());
        assert.equal(submissions, before + 1, 'Busy state must prevent duplicate password requests');
        pending.release.resolve();
        await expectFeedback(response.message, response.tone);
        assert.equal(await button.isEnabled(), true);
        assert.equal(await button.getAttribute('aria-busy'), null);
        assert.equal(await button.innerText(), copy.button);
        assert.equal(await current.isEnabled(), true);
        assert.equal(await replacement.isEnabled(), true);
        assert.equal(await page.locator('#signedInAccountPanel').isVisible(), true);
        assert.equal(await current.inputValue(), response.status === 200 ? '' : 'Fixture-current-password-42');
        assert.equal(await replacement.inputValue(), response.status === 200 ? '' : 'Fixture-replacement-password-84');
      }
      assert.deepEqual(errors, [], `${language}: password feedback emitted browser errors`);
    } finally {
      pending?.release.resolve();
      await context.close();
    }
  }
}
