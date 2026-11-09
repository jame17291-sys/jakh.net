export function ensureAuthModalShell() {
  if (!document.getElementById('openAuthBtn') || document.getElementById('authModal')) return;
  const modal = document.createElement('div');
  modal.id = 'authModal';
  modal.className = 'modal hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="auth"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <div class="modal-head">
        <div><p class="eyebrow" data-i18n="authEyebrow">Profile</p><h2 id="authModalTitle" data-i18n="authTitle">Create account or sign in</h2></div>
        <button class="icon-btn" type="button" data-close-modal="auth" aria-label="Close" data-i18n-aria-label="close">×</button>
      </div>
      <div id="authModalBody"></div>
    </div>`;
  document.body.appendChild(modal);
}

export function enhancePasswordInputs({ root, language, translate }) {
  const capsLockStatus = root.querySelector('#authCapsLockStatus');
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.nextElementSibling?.classList.contains('password-toggle')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.textContent = language === 'ar' ? 'إظهار' : 'Show';
    toggle.setAttribute('aria-label', translate('showPassword'));
    toggle.setAttribute('aria-pressed', 'false');
    input.insertAdjacentElement('afterend', toggle);
    toggle.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      toggle.textContent = reveal
        ? (language === 'ar' ? 'إخفاء' : 'Hide')
        : (language === 'ar' ? 'إظهار' : 'Show');
      toggle.setAttribute('aria-label', translate(reveal ? 'hidePassword' : 'showPassword'));
      toggle.setAttribute('aria-pressed', String(reveal));
      input.focus();
    });
    const reportCapsLock = (event) => {
      if (capsLockStatus) capsLockStatus.textContent = event.getModifierState?.('CapsLock') ? translate('capsLockOn') : '';
    };
    input.addEventListener('keydown', reportCapsLock);
    input.addEventListener('keyup', reportCapsLock);
    input.addEventListener('blur', () => { if (capsLockStatus) capsLockStatus.textContent = ''; });
  });
}

// Account-only markup is downloaded when Profile opens; event handlers stay in app.js
// and bind by the element ids below, so those ids are part of the contract:
// signedInAccountPanel, profileAvatar, avatarSelector, .avatar-btn[data-emoji],
// avatarStatus, currentPassword, newPassword, changePasswordRules,
// changePasswordStatus, changePasswordBtn, adminSecurityBtn, adminSecurityStatus,
// recoveryRotatePassword, recoveryRotateStatus, rotateRecoveryCodeBtn, logoutBtn,
// logoutStatus.

let profileStylesPromise;
export function loadProfileStyles() {
  if (profileStylesPromise) return profileStylesPromise;
  profileStylesPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/profile.css';
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => { link.remove(); profileStylesPromise = undefined; resolve(); }, { once: true });
    document.head.append(link);
  });
  return profileStylesPromise;
}

const AVATARS = ['👤','🦊','🦉','🐉','⚡️','🔥','👻','👽','🦄','🦁','🐼','👑','🚀','🧠','🧙‍♂️','👾'];

// Level titles from solved count. Thresholds are deliberately far apart so a
// title lasts long enough to mean something.
const LEVELS = [
  [0, 'Newcomer', 'وافد جديد'], [10, 'Explorer', 'مستكشف'], [50, 'Solver', 'حلّال ألغاز'], [150, 'Scholar', 'باحث'],
  [400, 'Sage', 'حكيم'], [1000, 'Master', 'أستاذ'], [2000, 'Legend', 'أسطورة'],
];
export function levelFor(solved, language) {
  let current = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (solved >= LEVELS[i][0]) current = LEVELS[i]; else { next = LEVELS[i]; break; }
  }
  return { title: language === 'ar' ? current[2] : current[1], next: next ? { at: next[0], title: language === 'ar' ? next[2] : next[1] } : null };
}

// The four difficulty medals that predate the trophy catalogue, folded into
// the same list so the profile shows one system.
function medals({ getCorrectCountByDifficulty, t }) {
  return [
    ['medal-bronze', '🥉', t('badgeBronzeName'), t('badgeBronze'), getCorrectCountByDifficulty('easy') >= 10],
    ['medal-silver', '🥈', t('badgeSilverName'), t('badgeSilver'), getCorrectCountByDifficulty('medium') >= 10],
    ['medal-gold', '🥇', t('badgeGoldName'), t('badgeGold'), getCorrectCountByDifficulty('hard') >= 10],
    ['medal-diamond', '💎', t('badgeDiamondName'), t('badgeDiamond'), getCorrectCountByDifficulty('very-advanced') >= 10],
  ].map(([id, icon, title, description, earned]) => ({ id, icon, title, description, earned }));
}

export function renderAccountPanel({
  account, language, role, score, correctCount, progress, categories, getCorrectCountByDifficulty,
  avatarSaving, securityLoading, privacyPath, t, fmt, escapeHtml,
  totalQuestions = 0, streak = 0, bestStreak = 0, trophies = null,
}) {
  const ar = language === 'ar';
  const e = escapeHtml;
  const n = (value) => Number(value || 0).toLocaleString('en-US');
  const level = levelFor(correctCount, language);
  const pct = totalQuestions ? Math.min(100, Math.round((correctCount / totalQuestions) * 100)) : 0;

  // --- Topics: progress and a next step from the correct/wrong record.
  const byCategory = new Map();
  for (const entry of progress) {
    const slug = entry.categoryId && entry.categoryId !== 'unknown' ? entry.categoryId : null;
    if (!slug) continue;
    const row = byCategory.get(slug) || { correct: 0, wrong: 0 };
    if (String(entry.status).startsWith('wrong-')) row.wrong++; else row.correct++;
    byCategory.set(slug, row);
  }
  const topicRows = [...byCategory.entries()].map(([slug, counts]) => {
    const category = categories.find(item => item.slug === slug);
    const total = category?.count || 0;
    return { slug, name: category?.title?.[language] || category?.title?.en || slug, emoji: category?.emoji || '📚', ...counts,
      pct: total ? Math.min(100, Math.round((counts.correct / total) * 100)) : 0, attempts: counts.correct + counts.wrong };
  }).filter(row => row.attempts > 0);
  const leading = [...topicRows].sort((a, b) => b.pct - a.pct || b.correct - a.correct).slice(0, 3);
  const weakest = [...topicRows].filter(row => row.wrong >= 2 && row.wrong > row.correct).sort((a, b) => (b.wrong / b.attempts) - (a.wrong / a.attempts))[0] || null;
  const topicLink = (slug) => ar ? `/ar/topics/${slug}/` : `/${slug}`;

  const topicsHtml = leading.length ? `
    <section class="profile-section" aria-labelledby="profileTopicsTitle">
      <h3 id="profileTopicsTitle" class="profile-section-title">${e(ar ? 'موضوعاتك' : 'Your topics')}</h3>
      <ul class="profile-topics">
        ${leading.map(row => `<li class="profile-topic">
          <a class="profile-topic-link" href="${topicLink(row.slug)}">
            <span class="profile-topic-emoji" aria-hidden="true">${e(row.emoji)}</span>
            <span class="profile-topic-name">${e(row.name)}</span>
            <span class="profile-topic-bar" aria-hidden="true"><span class="profile-topic-fill" style="width:${row.pct}%"></span></span>
            <span class="profile-topic-pct">${n(row.pct)}%</span>
          </a>
        </li>`).join('')}
      </ul>
      ${weakest ? `<p class="profile-nudge">${ar
        ? `أخطأت في ${n(weakest.wrong)} من ${n(weakest.attempts)} في <strong>${e(weakest.name)}</strong>. `
        : `You missed ${n(weakest.wrong)} of ${n(weakest.attempts)} in <strong>${e(weakest.name)}</strong>. `}<a href="${topicLink(weakest.slug)}">${e(ar ? 'جرّبه مرة أخرى' : 'Try it again')} →</a></p>` : ''}
    </section>` : `
    <section class="profile-section">
      <h3 class="profile-section-title">${e(ar ? 'موضوعاتك' : 'Your topics')}</h3>
      <p class="profile-empty">${e(ar ? 'أجب عن بضعة أسئلة في أي موضوع وستظهر هنا.' : 'Answer a few questions in any topic and it will appear here.')}</p>
    </section>`;

  // --- Trophies: the catalogue (when app.js passed it) plus the four medals.
  const medalList = medals({ getCorrectCountByDifficulty, t });
  const catalogue = trophies ? trophies.all.map(a => ({ id: a.id, icon: a.icon, title: trophies.title(a), description: trophies.description(a), earned: trophies.earnedIds.has(a.id), group: a.group })) : [];
  const allTrophies = [...catalogue, ...medalList];
  const earnedTrophies = allTrophies.filter(item => item.earned);
  const rank = { shuffle: 0, streak: 1, solve: 2 };
  const lockedTrophies = allTrophies.filter(item => !item.earned).sort((a, b) => (rank[a.group] ?? 3) - (rank[b.group] ?? 3));
  const trophyItem = item => `<li class="profile-trophy${item.earned ? ' is-earned' : ' is-locked'}">
    <span class="profile-trophy-icon" aria-hidden="true">${item.earned ? e(item.icon) : '🔒'}</span>
    <span class="profile-trophy-text"><span class="profile-trophy-name">${e(item.title)}${item.earned ? '' : `<span class="sr-only"> · ${e(ar ? 'مقفل' : 'Locked')}</span>`}</span><span class="profile-trophy-desc">${e(item.description)}</span></span>
  </li>`;
  const shownLocked = lockedTrophies.slice(0, 3), restLocked = lockedTrophies.slice(3);
  const trophiesHtml = `
    <section class="profile-section" aria-labelledby="profileTrophiesTitle">
      <h3 id="profileTrophiesTitle" class="profile-section-title">${e(ar ? 'خزانة الجوائز' : 'Trophy case')} <span class="profile-section-count">${n(earnedTrophies.length)}/${n(allTrophies.length)}</span></h3>
      ${earnedTrophies.length ? '' : `<p class="profile-empty">${e(ar ? 'لم تحصل على جوائز بعد. أول إجابة صحيحة تمنحك الأولى.' : 'No trophies yet. Your first correct answer earns the first one.')}</p>`}
      <ul class="profile-trophies">${[...earnedTrophies, ...shownLocked].map(trophyItem).join('')}</ul>
      ${restLocked.length ? `<details class="profile-more"><summary>${e(ar ? `كل الجوائز (${n(allTrophies.length)})` : `All trophies (${n(allTrophies.length)})`)}</summary><ul class="profile-trophies">${restLocked.map(trophyItem).join('')}</ul></details>` : ''}
    </section>`;

  const isAdmin = role === 'ADMIN' || role === 'OWNER';

  return `
      <section class="auth-panel profile" id="signedInAccountPanel" tabindex="-1">
        <header class="profile-head">
          <div id="profileAvatar" class="profile-avatar" aria-hidden="true">${e(account.avatar)}</div>
          <div class="profile-identity">
            <h3 class="profile-name">${e(account.username)}</h3>
            <p class="profile-level"><span class="profile-level-title">${e(level.title)}</span>${level.next ? ` <span class="profile-level-next">· ${ar ? `${e(level.next.title)} عند ${n(level.next.at)}` : `${e(level.next.title)} at ${n(level.next.at)}`}</span>` : ''}</p>
            <button type="button" class="profile-avatar-toggle" data-lang="${ar ? 'ar' : 'en'}" aria-expanded="true" aria-controls="avatarSelector">${e(ar ? 'إخفاء الصور الرمزية' : 'Hide avatars')}</button>
          </div>
        </header>
        <div id="avatarSelector" class="profile-avatar-picker" tabindex="-1" ${avatarSaving ? 'aria-busy="true"' : ''}>
          ${AVATARS.map(emoji => `<button type="button" class="avatar-btn ${account.avatar === emoji ? 'is-active' : ''}" ${avatarSaving ? 'disabled' : ''} aria-describedby="avatarStatus" aria-label="${e(fmt('chooseAvatarAria', { avatar: emoji }))}" aria-pressed="${account.avatar === emoji ? 'true' : 'false'}" data-emoji="${emoji}">${emoji}</button>`).join('')}
          <p id="avatarStatus" class="auth-inline-status" role="status" aria-live="polite" aria-atomic="true">${avatarSaving ? e(t('avatarSaving')) : ''}</p>
        </div>

        <ul class="profile-stats">
          <li class="profile-stat"><strong>${n(correctCount)}</strong><span>${e(ar ? 'إجابة صحيحة' : 'solved')}</span><small>${totalQuestions ? e(ar ? `${n(pct)}% من المكتبة` : `${n(pct)}% of the library`) : ''}</small></li>
          <li class="profile-stat${streak > 0 ? ' is-streak' : ''}"><strong>${streak > 0 ? `🔥 ${n(streak)}` : '—'}</strong><span>${e(ar ? 'أيام متتالية' : 'day streak')}</span><small>${bestStreak > streak ? e(ar ? `الأفضل ${n(bestStreak)}` : `best ${n(bestStreak)}`) : (streak > 0 ? e(ar ? 'العب غدًا لتحافظ عليها' : 'play tomorrow to keep it') : e(ar ? 'أنهِ جولة اليوم' : 'finish a round today'))}</small></li>
          <li class="profile-stat"><strong>${n(earnedTrophies.length)}</strong><span>${e(ar ? 'جوائز' : 'trophies')}</span><small>${e(ar ? `من ${n(allTrophies.length)}` : `of ${n(allTrophies.length)}`)}</small></li>
        </ul>
        <div class="profile-progress" role="img" aria-label="${e(ar ? `${n(pct)}% من الأسئلة محلولة` : `${n(pct)}% of questions solved`)}"><span class="profile-progress-fill" style="width:${pct}%"></span></div>
        <p class="profile-progress-text">${e(ar ? `${n(correctCount)} من ${n(totalQuestions)} سؤالاً · ${n(score)} نقطة تدريب · ${n(account.favorites.length)} في المفضلة` : `${n(correctCount)} of ${n(totalQuestions)} questions · ${n(score)} practice pts · ${n(account.favorites.length)} saved`)}</p>

        ${trophiesHtml}
        ${topicsHtml}

        <details class="profile-settings" id="profileSettings" open>
          <summary>${e(ar ? 'الحساب والأمان' : 'Account & security')}</summary>
          <div class="profile-settings-body">
            <p class="muted">${e(t('accountReady'))}</p>

            <h4 class="profile-settings-title">${e(ar ? 'تغيير كلمة المرور' : 'Change password')}</h4>
            <div class="form-row">
              <label><span>${e(ar ? 'كلمة المرور الحالية' : 'Current password')}</span><input type="password" id="currentPassword" autocomplete="current-password" aria-describedby="changePasswordStatus" /></label>
              <label><span>${e(ar ? 'كلمة المرور الجديدة' : 'New password')}</span><input type="password" id="newPassword" autocomplete="new-password" minlength="15" maxlength="128" aria-describedby="changePasswordRules changePasswordStatus" /></label>
            </div>
            <p id="changePasswordRules" class="password-rules">${e(t('passwordRules'))}</p>
            <p id="changePasswordStatus" class="auth-inline-status" role="status" aria-live="polite" aria-atomic="true"></p>
            <button class="mini-btn" type="button" id="changePasswordBtn" aria-describedby="changePasswordStatus">${e(ar ? 'تحديث كلمة المرور' : 'Update Password')}</button>

            ${isAdmin ? `<h4 class="profile-settings-title">${e(ar ? 'حماية الوصول إلى الإدارة' : 'Protect admin access')}</h4><p class="muted">${e(ar ? 'أضف تطبيق مصادقة واحفظ رموز الاسترداد لفتح لوحة الإدارة بأمان.' : 'Add an authenticator and save recovery codes to securely open the administration console.')}</p><button class="secondary-btn" type="button" id="adminSecurityBtn" aria-describedby="adminSecurityStatus" ${securityLoading ? 'disabled aria-busy="true"' : ''}>${e(ar ? 'إعداد تطبيق المصادقة أو التحقق منه' : 'Set up or verify authenticator')}</button><p id="adminSecurityStatus" class="auth-inline-status" role="status" aria-live="polite" aria-atomic="true">${securityLoading ? e(t('adminSecurityLoading')) : ''}</p>` : ''}

            <h4 class="profile-settings-title">${e(t('recoveryRotateTitle'))}</h4>
            <p class="muted">${e(t('recoveryRotateLead'))}</p>
            <div class="form-row">
              <label><span>${e(ar ? 'كلمة المرور الحالية' : 'Current password')}</span><input type="password" id="recoveryRotatePassword" autocomplete="current-password" required minlength="8" maxlength="128" /></label>
            </div>
            <p id="recoveryRotateStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
            <button class="mini-btn" type="button" id="rotateRecoveryCodeBtn">${e(t('recoveryRotate'))}</button>

            <div class="profile-settings-links">
              ${isAdmin ? `<a class="secondary-btn" href="/admin${ar ? '?lang=ar' : ''}">🛡 ${e(t('adminConsole'))}</a>` : ''}
              <a class="secondary-btn" href="${privacyPath}">${e(ar ? 'الخصوصية وبيانات الحساب' : 'Privacy & account data')}</a>
              <button class="ghost-btn profile-logout" type="button" id="logoutBtn">${e(t('logout'))}</button>
            </div>
            <p id="logoutStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
          </div>
        </details>
      </section>
    `;
}

// Behaviour that belongs to the markup rather than to app.js: the avatar
// picker toggle. Idempotent; app.js binds the avatar buttons themselves.
export function bindProfilePanel(root) {
  const toggle = root?.querySelector('.profile-avatar-toggle');
  const picker = root?.querySelector('#avatarSelector');
  if (!toggle || !picker || toggle.dataset.bound) return;
  toggle.dataset.bound = '1';
  const labels = toggle.dataset.lang === 'ar' ? ['إخفاء الصور الرمزية', 'تغيير الصورة الرمزية'] : ['Hide avatars', 'Change avatar'];
  toggle.addEventListener('click', () => {
    const open = picker.hidden;
    picker.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? labels[0] : labels[1];
    if (open) picker.querySelector('.avatar-btn.is-active, .avatar-btn')?.focus();
  });
}
