(() => {
  "use strict";

  const API = "https://api.jakh.net/api";
  const ADMIN_ROLES = new Set(["ADMIN", "OWNER"]);
  const ROLE_KEYS = Object.freeze({ USER: "member", ADMIN: "administrator", OWNER: "owner" });
  const FEEDBACK_STATES = ["new", "reviewed", "implemented", "rejected"];
  const ACTION_CONFIRMATION_TOKEN = "REVOKE";
  const ACTION_REASON_MAX_LENGTH = 280;

  const COPY = {
    en: {
      skipToMain: "Skip to main content",
      brandEyebrow: "JAKH.NET · CONTROL ROOM",
      checkingAccess: "Checking access…",
      viewSite: "View site",
      refresh: "Refresh",
      signOut: "Sign out",
      secureAdmin: "Secure administration",
      checkingAccessTitle: "Checking your access",
      checkingAccessMessage: "We are verifying your signed-in JAKH account and role.",
      tryAgain: "Try again",
      adminScope: "Administration applies only to JAKH accounts and jakh.net operations.",
      overview: "Overview",
      people: "People",
      feedback: "Feedback",
      auditLog: "Audit log",
      security: "Security",
      operations: "Operations",
      overviewHeading: "A clear view of JAKH.",
      overviewLead: "Monitor members, moderation work, service readiness, and account safety from one place.",
      updated: "Updated",
      serviceReadiness: "Service readiness",
      productionStatus: "Production status",
      checking: "Checking",
      healthChecking: "Checking the JAKH API and database schema.",
      guardrailRoles: "Server-enforced JAKH roles",
      guardrailAudit: "Privileged changes are recorded",
      guardrailStepUp: "High-impact actions need password confirmation",
      priorityQueue: "Priority queue",
      nextActions: "What needs attention",
      recentMembers: "Recent members",
      recentMembersHint: "Latest account registrations",
      managePeople: "Manage people",
      recentFeedback: "Recent feedback",
      recentFeedbackHint: "Newest visitor suggestions",
      reviewFeedback: "Review feedback",
      accessManagement: "Access management",
      peopleHeading: "People and permissions.",
      peopleLead: "Search accounts, review status, and make deliberate access decisions. Owner accounts remain protected.",
      searchPeople: "Search people",
      searchPeoplePlaceholder: "Username or email",
      role: "Role",
      allRoles: "All roles",
      member: "Member",
      administrator: "Administrator",
      owner: "Owner",
      accountStatus: "Account status",
      allStatuses: "All statuses",
      active: "Active",
      suspended: "Suspended",
      applyFilters: "Apply filters",
      emailOwnerOnly: "Contact details are visible to owners only.",
      loadMore: "Load more",
      moderation: "Moderation",
      feedbackHeading: "Close the feedback loop.",
      feedbackLead: "Triage incoming ideas with a visible, auditable review state.",
      reviewState: "Review state",
      allFeedback: "All feedback",
      new: "New",
      reviewed: "Reviewed",
      implemented: "Implemented",
      rejected: "Rejected",
      ownerOnly: "Owner-only",
      auditHeading: "A record of privileged work.",
      auditLead: "Review the latest role, access, moderation, and session-security changes.",
      refreshLog: "Refresh log",
      securityHeading: "Make sensitive changes deliberately.",
      securityLead: "Your active JAKH session is protected; password confirmation is required before high-impact administrative changes.",
      stepUp: "Step-up confirmation",
      confirmIdentity: "Confirm your identity",
      confirmationRequired: "Confirmation required",
      stepUpDescription: "Confirm your password to unlock role changes, suspensions, and session-wide security actions for ten minutes.",
      confirmPassword: "Confirm password",
      builtInSafeguards: "Built-in safeguards",
      securityControls: "Security controls",
      safeguardOne: "JAKH roles are checked by the API, not the browser.",
      safeguardTwo: "Owner role changes and administrator suspension are owner-restricted.",
      safeguardThree: "Access changes end affected sessions and create an audit event.",
      sessionControl: "Session control",
      sessionControlLead: "End every active session held by non-owner accounts. Your owner session stays signed in.",
      revokeSessions: "Sign out non-owner sessions",
      reauthTitle: "Confirm it is you",
      reauthLead: "Enter your current JAKH password. It is used only to confirm this session and is never stored by the console.",
      currentPassword: "Current password",
      cancel: "Cancel",
      members: "Members",
      privileged: "Privileged accounts",
      activeSessions: "Active sessions",
      correctSolves: "Correct solves",
      newFeedback: "New feedback",
      suspendedAccounts: "Suspended accounts",
      allTime: "all time",
      ownerAndAdmin: "owner and admin",
      liveNow: "currently active",
      answeredCorrectly: "answered correctly",
      awaitingReview: "awaiting review",
      accessRestricted: "access restricted",
      apiHealthy: "Operational",
      apiUnhealthy: "Needs attention",
      healthReady: "JAKH API is responding and schema {schema} is ready.",
      healthUnavailable: "The production health check could not be completed. Try refreshing before taking action.",
      feedbackAwaiting: "feedback items waiting for review",
      accountsSuspended: "accounts currently suspended",
      allCaughtUp: "No new feedback is waiting for review.",
      noMembers: "No members yet.",
      noFeedback: "No feedback yet.",
      noMatchingPeople: "No people match these filters.",
      noMatchingFeedback: "No feedback matches this filter.",
      noAuditEvents: "No privileged activity has been recorded yet.",
      loading: "Loading…",
      joined: "Joined {date}",
      lastSignedIn: "Last sign-in {date}",
      noEmail: "No contact email",
      contactHidden: "Contact data hidden",
      changeRole: "Change role",
      suspend: "Suspend",
      restore: "Restore",
      updateState: "Update state",
      reviewAction: "Review action",
      reviewActionTitle: "Review before confirming",
      reviewActionLead: "Check the target and impact before this protected change is sent.",
      action: "Action",
      target: "Target",
      impact: "Impact",
      reasonOptional: "Reason (optional)",
      reasonPlaceholder: "Add a short operational reason",
      reasonHint: "If supplied, this reason is recorded in the audit log.",
      typedConfirmation: "Confirmation required",
      typedConfirmationLead: "Type {token} to sign out every non-owner session.",
      typedConfirmationInput: "Type the confirmation phrase",
      typedConfirmationMismatch: "Type {token} exactly before confirming this action.",
      confirmAction: "Confirm action",
      roleChangeAction: "Change role",
      suspendAction: "Suspend account",
      restoreAction: "Restore access",
      revokeSessionsAction: "Sign out non-owner sessions",
      roleChangeImpact: "The role will change to {role}, and active sessions will end.",
      suspendImpact: "The account will be suspended and active sessions will end immediately.",
      restoreImpact: "The account will regain access. Ended sessions remain ended.",
      revokeSessionsImpact: "Every active non-owner session will end. This cannot be undone; your owner session stays signed in.",
      allNonOwnerAccounts: "All non-owner accounts",
      roleUpdated: "Role updated and affected sessions ended.",
      accessSuspended: "Account suspended and active sessions ended.",
      accessRestored: "Account access restored.",
      feedbackUpdated: "Feedback review state updated.",
      sessionsRevoked: "{count} non-owner session(s) signed out.",
      passwordConfirmed: "Password confirmed for this session.",
      confirmationValidUntil: "Confirmed until {time}.",
      confirmationNeeded: "Confirm your password before high-impact actions.",
      accessConnected: "Admin connected",
      signedOutTitle: "Sign in to manage JAKH",
      signedOutMessage: "Use your JAKH owner or administrator account. We will bring you back to this console after sign-in.",
      signInToJakh: "Sign in to JAKH",
      unauthorizedTitle: "This account does not have admin access",
      unauthorizedMessage: "You are signed in, but this JAKH account is not an administrator or owner. Ask an owner to review your role.",
      returnToSite: "Return to JAKH",
      offlineTitle: "The admin service is unavailable",
      offlineMessage: "We could not reach the JAKH administration API. Check your connection and try again.",
      requestFailed: "That request could not be completed. Please try again.",
      sessionExpired: "Your session has expired. Sign in again to continue.",
      passwordConfirmationFailed: "Password confirmation failed. Please try again.",
      highImpactConfirmation: "Confirm your password before continuing.",
      auditRole: "changed a member role",
      auditBan: "suspended an account",
      auditUnban: "restored an account",
      auditFeedback: "updated feedback review state",
      auditReauth: "reconfirmed their password",
      auditSessions: "signed out non-owner sessions",
      auditGeneric: "performed a privileged action",
      actionTarget: "Target: {target}",
      switchLanguage: "Switch language",
      refreshComplete: "Console refreshed.",
      privacyShort: "Contact data is restricted to owners.",
    },
    ar: {
      skipToMain: "انتقل إلى المحتوى الرئيسي",
      brandEyebrow: "JAKH.NET · مركز التحكم",
      checkingAccess: "جارٍ التحقق من الوصول…",
      viewSite: "عرض الموقع",
      refresh: "تحديث",
      signOut: "تسجيل الخروج",
      secureAdmin: "إدارة آمنة",
      checkingAccessTitle: "جارٍ التحقق من صلاحياتك",
      checkingAccessMessage: "نتحقق من حساب JAKH المسجل ودوره.",
      tryAgain: "حاول مجدداً",
      adminScope: "تنطبق الإدارة على حسابات JAKH وعمليات jakh.net فقط.",
      overview: "نظرة عامة",
      people: "الأشخاص",
      feedback: "الملاحظات",
      auditLog: "سجل التدقيق",
      security: "الأمان",
      operations: "العمليات",
      overviewHeading: "رؤية واضحة لـ JAKH.",
      overviewLead: "تابع الأعضاء وأعمال المراجعة وجاهزية الخدمة وأمان الحسابات من مكان واحد.",
      updated: "تم التحديث",
      serviceReadiness: "جاهزية الخدمة",
      productionStatus: "حالة الإنتاج",
      checking: "جارٍ التحقق",
      healthChecking: "جارٍ فحص واجهة JAKH وقاعدة البيانات.",
      guardrailRoles: "أدوار JAKH مفروضة من الخادم",
      guardrailAudit: "التغييرات الحساسة تُسجل",
      guardrailStepUp: "الإجراءات المؤثرة تحتاج تأكيد كلمة المرور",
      priorityQueue: "قائمة الأولويات",
      nextActions: "ما الذي يحتاج إلى انتباه",
      recentMembers: "أحدث الأعضاء",
      recentMembersHint: "أحدث تسجيلات الحسابات",
      managePeople: "إدارة الأشخاص",
      recentFeedback: "أحدث الملاحظات",
      recentFeedbackHint: "أحدث اقتراحات الزوار",
      reviewFeedback: "مراجعة الملاحظات",
      accessManagement: "إدارة الوصول",
      peopleHeading: "الأشخاص والصلاحيات.",
      peopleLead: "ابحث في الحسابات وراجع الحالة واتخذ قرارات وصول مدروسة. حسابات المالك محمية دائماً.",
      searchPeople: "البحث عن أشخاص",
      searchPeoplePlaceholder: "اسم المستخدم أو البريد الإلكتروني",
      role: "الدور",
      allRoles: "كل الأدوار",
      member: "عضو",
      administrator: "مسؤول",
      owner: "مالك",
      accountStatus: "حالة الحساب",
      allStatuses: "كل الحالات",
      active: "نشط",
      suspended: "معلّق",
      applyFilters: "تطبيق المرشحات",
      emailOwnerOnly: "بيانات التواصل مرئية للمالكين فقط.",
      loadMore: "تحميل المزيد",
      moderation: "المراجعة",
      feedbackHeading: "أغلق دائرة الملاحظات.",
      feedbackLead: "فرز الأفكار الواردة مع حالة مراجعة مرئية وقابلة للتدقيق.",
      reviewState: "حالة المراجعة",
      allFeedback: "كل الملاحظات",
      new: "جديد",
      reviewed: "تمت المراجعة",
      implemented: "تم التنفيذ",
      rejected: "مرفوض",
      ownerOnly: "للمالك فقط",
      auditHeading: "سجل العمل ذي الصلاحيات العالية.",
      auditLead: "راجع أحدث تغييرات الأدوار والوصول والمراجعة وأمان الجلسات.",
      refreshLog: "تحديث السجل",
      securityHeading: "نفّذ التغييرات الحساسة بعناية.",
      securityLead: "جلسة JAKH الحالية محمية؛ يلزم تأكيد كلمة المرور قبل الإجراءات الإدارية المؤثرة.",
      stepUp: "تأكيد إضافي",
      confirmIdentity: "أكد هويتك",
      confirmationRequired: "يلزم التأكيد",
      stepUpDescription: "أكد كلمة مرورك لفتح تغييرات الأدوار والإيقاف وإجراءات أمان الجلسات لمدة عشر دقائق.",
      confirmPassword: "تأكيد كلمة المرور",
      builtInSafeguards: "ضوابط مدمجة",
      securityControls: "ضوابط الأمان",
      safeguardOne: "يتحقق الخادم من أدوار JAKH وليس المتصفح.",
      safeguardTwo: "تغييرات دور المالك وإيقاف المسؤولين مقيدة بالمالك.",
      safeguardThree: "تغييرات الوصول تنهي الجلسات المتأثرة وتنشئ حدث تدقيق.",
      sessionControl: "التحكم بالجلسات",
      sessionControlLead: "إنهاء كل الجلسات النشطة للحسابات غير المالكة. تبقى جلسة المالك مسجلة.",
      revokeSessions: "تسجيل خروج جلسات غير المالك",
      reauthTitle: "أكد أنك أنت",
      reauthLead: "أدخل كلمة مرور JAKH الحالية. تُستخدم فقط لتأكيد هذه الجلسة ولا تخزنها اللوحة.",
      currentPassword: "كلمة المرور الحالية",
      cancel: "إلغاء",
      members: "الأعضاء",
      privileged: "الحسابات ذات الصلاحية",
      activeSessions: "الجلسات النشطة",
      correctSolves: "الإجابات الصحيحة",
      newFeedback: "ملاحظات جديدة",
      suspendedAccounts: "الحسابات المعلقة",
      allTime: "الإجمالي",
      ownerAndAdmin: "مالك ومسؤول",
      liveNow: "نشطة حالياً",
      answeredCorrectly: "إجابات صحيحة",
      awaitingReview: "بانتظار المراجعة",
      accessRestricted: "وصول مقيّد",
      apiHealthy: "تعمل",
      apiUnhealthy: "تحتاج انتباهاً",
      healthReady: "واجهة JAKH تعمل وإصدار المخطط {schema} جاهز.",
      healthUnavailable: "تعذر إكمال فحص الإنتاج. حدّث الصفحة قبل تنفيذ أي إجراء.",
      feedbackAwaiting: "ملاحظة بانتظار المراجعة",
      accountsSuspended: "حسابات معلقة حالياً",
      allCaughtUp: "لا توجد ملاحظات جديدة بانتظار المراجعة.",
      noMembers: "لا يوجد أعضاء بعد.",
      noFeedback: "لا توجد ملاحظات بعد.",
      noMatchingPeople: "لا يوجد أشخاص يطابقون هذه المرشحات.",
      noMatchingFeedback: "لا توجد ملاحظات تطابق هذا المرشح.",
      noAuditEvents: "لم يُسجل أي نشاط ذي صلاحية عالية بعد.",
      loading: "جارٍ التحميل…",
      joined: "انضم في {date}",
      lastSignedIn: "آخر دخول {date}",
      noEmail: "لا يوجد بريد للتواصل",
      contactHidden: "بيانات التواصل مخفية",
      changeRole: "تغيير الدور",
      suspend: "تعليق",
      restore: "استعادة",
      updateState: "تحديث الحالة",
      reviewAction: "مراجعة الإجراء",
      reviewActionTitle: "راجع قبل التأكيد",
      reviewActionLead: "تحقق من الهدف والأثر قبل إرسال هذا التغيير المحمي.",
      action: "الإجراء",
      target: "الهدف",
      impact: "الأثر",
      reasonOptional: "السبب (اختياري)",
      reasonPlaceholder: "أضف سبباً تشغيلياً مختصراً",
      reasonHint: "إذا أضفته، يُسجل هذا السبب في سجل التدقيق.",
      typedConfirmation: "يلزم تأكيد إضافي",
      typedConfirmationLead: "اكتب {token} لتسجيل خروج كل جلسات غير المالك.",
      typedConfirmationInput: "اكتب عبارة التأكيد",
      typedConfirmationMismatch: "اكتب {token} تماماً قبل تأكيد هذا الإجراء.",
      confirmAction: "تأكيد الإجراء",
      roleChangeAction: "تغيير الدور",
      suspendAction: "تعليق الحساب",
      restoreAction: "استعادة الوصول",
      revokeSessionsAction: "تسجيل خروج جلسات غير المالك",
      roleChangeImpact: "سيتغير الدور إلى {role} وستنتهي الجلسات النشطة.",
      suspendImpact: "سيُعلّق الحساب وتنتهي جلساته النشطة فوراً.",
      restoreImpact: "سيستعيد الحساب الوصول. تبقى الجلسات المنتهية منتهية.",
      revokeSessionsImpact: "ستنتهي كل جلسات غير المالك النشطة. لا يمكن التراجع عن ذلك؛ تبقى جلسة المالك مسجلة.",
      allNonOwnerAccounts: "كل حسابات غير المالك",
      roleUpdated: "تم تحديث الدور وإنهاء الجلسات المتأثرة.",
      accessSuspended: "تم تعليق الحساب وإنهاء الجلسات النشطة.",
      accessRestored: "تمت استعادة وصول الحساب.",
      feedbackUpdated: "تم تحديث حالة مراجعة الملاحظة.",
      sessionsRevoked: "تم تسجيل خروج {count} جلسة لغير المالك.",
      passwordConfirmed: "تم تأكيد كلمة المرور لهذه الجلسة.",
      confirmationValidUntil: "التأكيد صالح حتى {time}.",
      confirmationNeeded: "أكد كلمة مرورك قبل الإجراءات المؤثرة.",
      accessConnected: "تم ربط الإدارة",
      signedOutTitle: "سجل الدخول لإدارة JAKH",
      signedOutMessage: "استخدم حساب مالك أو مسؤول JAKH. سنعيدك إلى هذه اللوحة بعد تسجيل الدخول.",
      signInToJakh: "تسجيل الدخول إلى JAKH",
      unauthorizedTitle: "هذا الحساب لا يملك صلاحية الإدارة",
      unauthorizedMessage: "أنت مسجل الدخول، لكن حساب JAKH هذا ليس مسؤولاً أو مالكاً. اطلب من مالك مراجعة دورك.",
      returnToSite: "العودة إلى JAKH",
      offlineTitle: "خدمة الإدارة غير متاحة",
      offlineMessage: "تعذر الوصول إلى واجهة إدارة JAKH. تحقق من الاتصال وحاول مجدداً.",
      requestFailed: "تعذر إتمام الطلب. حاول مجدداً.",
      sessionExpired: "انتهت جلستك. سجل الدخول مجدداً للمتابعة.",
      passwordConfirmationFailed: "فشل تأكيد كلمة المرور. حاول مجدداً.",
      highImpactConfirmation: "أكد كلمة مرورك قبل المتابعة.",
      auditRole: "غيّر دور عضو",
      auditBan: "علّق حساباً",
      auditUnban: "استعاد حساباً",
      auditFeedback: "حدّث حالة مراجعة ملاحظة",
      auditReauth: "أعاد تأكيد كلمة مروره",
      auditSessions: "سجّل خروج جلسات غير المالك",
      auditGeneric: "نفّذ إجراء ذا صلاحية عالية",
      actionTarget: "الهدف: {target}",
      switchLanguage: "تغيير اللغة",
      refreshComplete: "تم تحديث اللوحة.",
      privacyShort: "بيانات التواصل مقيدة للمالكين.",
    },
  };

  const state = {
    lang: initialLanguage(),
    me: null,
    overview: null,
    health: null,
    security: null,
    audit: null,
    activeTab: "overview",
    gateMode: "checking",
    people: { items: [], nextOffset: null, canViewEmail: false },
    feedback: { items: [], nextOffset: null, canViewEmail: false },
    stepUpResolver: null,
    actionReview: null,
    actionReviewResolver: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const els = {};

  class AdminApiError extends Error {
    constructor(message, status = 0, code = "REQUEST_FAILED") {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  function initialLanguage() {
    const requested = new URL(location.href).searchParams.get("lang");
    if (requested === "ar" || requested === "en") return requested;
    try {
      const saved = JSON.parse(localStorage.getItem("jakh-riddles-settings") || "{}");
      return saved.lang === "ar" ? "ar" : "en";
    } catch {
      return "en";
    }
  }

  function t(key, values = {}) {
    const text = COPY[state.lang]?.[key] || COPY.en[key] || key;
    return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (_match, name) => String(values[name] ?? ""));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[character]));
  }

  function dateFormat(value, withTime = false) {
    if (!value || Number.isNaN(Date.parse(value))) return "—";
    return new Intl.DateTimeFormat(state.lang === "ar" ? "ar" : undefined, {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" } : {}),
    }).format(new Date(value));
  }

  function numberFormat(value) {
    return new Intl.NumberFormat(state.lang === "ar" ? "ar" : undefined).format(Number(value) || 0);
  }

  function roleLabel(role) {
    return t(ROLE_KEYS[role] || "member");
  }

  function statusLabel(status) {
    return t(status || "new");
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        credentials: "include",
        cache: "no-store",
        ...options,
        headers,
      });
    } catch {
      throw new AdminApiError(t("offlineMessage"), 0, "NETWORK_ERROR");
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new AdminApiError(body.error || t("requestFailed"), response.status, body.code);
    return body;
  }

  function setConnection(kind, text) {
    els.connectionState.className = `connection-state ${kind}`;
    els.connectionState.textContent = text;
  }

  function signInHref() {
    const target = `/admin${state.lang === "ar" ? "?lang=ar" : ""}`;
    const url = new URL("/", location.origin);
    url.searchParams.set("next", target);
    if (state.lang === "ar") url.searchParams.set("lang", "ar");
    return `${url.pathname}${url.search}`;
  }

  function updateSiteLinks() {
    els.viewSite.href = state.lang === "ar" ? "/?lang=ar" : "/";
    els.languageToggle.textContent = state.lang === "ar" ? "English" : "العربية";
    els.languageToggle.setAttribute("aria-label", t("switchLanguage"));
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
    document.title = state.lang === "ar" ? "JAKH · الإدارة" : "JAKH · Administration";
    $$('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
    $$('[data-i18n-placeholder]').forEach((node) => { node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder)); });
    updateSiteLinks();
    renderGate();
    if (state.me) renderIdentity();
    if (state.overview) renderOverview(state.overview);
    if (state.health) renderHealth(state.health);
    if (state.people.items.length) renderPeople();
    if (state.feedback.items.length) renderFeedback();
    if (state.audit) renderAudit();
    if (state.security) renderSecurity();
    if (state.actionReview) renderActionReview();
  }

  function persistLanguage() {
    try { localStorage.setItem("jakh-riddles-settings", JSON.stringify({ lang: state.lang })); } catch { /* storage is optional */ }
    const url = new URL(location.href);
    if (state.lang === "ar") url.searchParams.set("lang", "ar");
    else url.searchParams.delete("lang");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " is-error" : ""}`;
    toast.textContent = message;
    els.toastRegion.append(toast);
    setTimeout(() => toast.remove(), 5_000);
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function gateButton(label, href, primary = false) {
    const link = document.createElement("a");
    link.className = primary ? "primary-button" : "secondary-button";
    link.href = href;
    link.textContent = label;
    return link;
  }

  function retryButton() {
    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = t("tryAgain");
    button.addEventListener("click", () => void establishAccess());
    return button;
  }

  function renderGate() {
    const gate = els.gate;
    const copy = {
      checking: ["checkingAccessTitle", "checkingAccessMessage"],
      signedOut: ["signedOutTitle", "signedOutMessage"],
      unauthorized: ["unauthorizedTitle", "unauthorizedMessage"],
      offline: ["offlineTitle", "offlineMessage"],
    }[state.gateMode] || ["checkingAccessTitle", "checkingAccessMessage"];
    els.gateTitle.textContent = t(copy[0]);
    els.gateMessage.textContent = t(copy[1]);
    clearNode(els.gateActions);
    if (state.gateMode === "signedOut") {
      els.gateActions.append(gateButton(t("signInToJakh"), signInHref(), true), retryButton());
    } else if (state.gateMode === "unauthorized") {
      els.gateActions.append(gateButton(t("returnToSite"), state.lang === "ar" ? "/?lang=ar" : "/", true));
    } else if (state.gateMode === "offline") {
      els.gateActions.append(retryButton());
    } else {
      const button = document.createElement("button");
      button.className = "primary-button";
      button.type = "button";
      button.disabled = true;
      button.textContent = t("checkingAccess");
      els.gateActions.append(button);
    }
    gate.hidden = Boolean(state.me && ADMIN_ROLES.has(state.me.role));
  }

  function showApp() {
    els.gate.hidden = true;
    els.adminApp.hidden = false;
  }

  function renderIdentity() {
    const user = state.me;
    els.identityName.textContent = user.username;
    els.identityRole.textContent = roleLabel(user.role).toUpperCase();
    els.identityAvatar.textContent = user.avatar || "👤";
    els.auditTab.hidden = user.role !== "OWNER";
    els.sessionControlCard.hidden = user.role !== "OWNER";
  }

  function metric(label, value, note) {
    return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(numberFormat(value))}</strong><span class="metric-note">${escapeHtml(note)}</span></article>`;
  }

  function activityItem(title, meta, badge = "") {
    return `<article class="activity-item"><div class="activity-main"><strong>${escapeHtml(title)}</strong><div class="activity-meta">${escapeHtml(meta)}</div></div>${badge}</article>`;
  }

  function renderOverview(data) {
    const metrics = data.metrics || {};
    els.metricGrid.innerHTML = [
      metric(t("members"), metrics.users, t("allTime")),
      metric(t("privileged"), metrics.administrators, t("ownerAndAdmin")),
      metric(t("activeSessions"), metrics.activeSessions, t("liveNow")),
      metric(t("correctSolves"), metrics.solved, t("answeredCorrectly")),
      metric(t("newFeedback"), metrics.pendingSuggestions, t("awaitingReview")),
      metric(t("suspendedAccounts"), metrics.suspendedUsers, t("accessRestricted")),
    ].join("");
    els.feedbackCount.hidden = !(metrics.pendingSuggestions > 0);
    els.feedbackCount.textContent = numberFormat(metrics.pendingSuggestions);
    els.lastUpdated.textContent = dateFormat(new Date().toISOString(), true);

    const queue = [];
    if (metrics.pendingSuggestions > 0) {
      queue.push(`<div class="queue-item"><div><strong>${escapeHtml(numberFormat(metrics.pendingSuggestions))}</strong><span>${escapeHtml(t("feedbackAwaiting"))}</span></div><button class="text-button" type="button" data-open-tab="feedback">${escapeHtml(t("reviewFeedback"))}</button></div>`);
    }
    if (metrics.suspendedUsers > 0) {
      queue.push(`<div class="queue-item"><div><strong>${escapeHtml(numberFormat(metrics.suspendedUsers))}</strong><span>${escapeHtml(t("accountsSuspended"))}</span></div><button class="text-button" type="button" data-open-tab="people">${escapeHtml(t("people"))}</button></div>`);
    }
    if (!queue.length) queue.push(`<div class="empty-state">${escapeHtml(t("allCaughtUp"))}</div>`);
    els.actionQueue.innerHTML = queue.join("");

    const canViewEmail = Boolean(data.permissions?.canViewEmail);
    els.recentUsers.innerHTML = data.recentUsers?.length
      ? data.recentUsers.map((user) => activityItem(
        user.username,
        `${canViewEmail ? (user.email || t("noEmail")) : t("contactHidden")} · ${t("joined", { date: dateFormat(user.createdAt) })}`,
        `<span class="mini-role ${String(user.role || "USER").toLowerCase()}">${escapeHtml(roleLabel(user.role))}</span>`,
      )).join("")
      : `<div class="empty-state">${escapeHtml(t("noMembers"))}</div>`;
    els.recentSuggestions.innerHTML = data.recentSuggestions?.length
      ? data.recentSuggestions.map((suggestion) => activityItem(
        suggestion.text,
        `${canViewEmail ? (suggestion.email || t("noEmail")) : t("contactHidden")} · ${dateFormat(suggestion.createdAt)}`,
        `<span class="status-label">${escapeHtml(statusLabel(suggestion.status))}</span>`,
      )).join("")
      : `<div class="empty-state">${escapeHtml(t("noFeedback"))}</div>`;
  }

  function renderHealth(health) {
    const isHealthy = health?.ok === true;
    els.healthPill.className = `status-pill ${isHealthy ? "is-good" : "is-danger"}`;
    els.healthPill.textContent = t(isHealthy ? "apiHealthy" : "apiUnhealthy");
    els.healthMessage.textContent = isHealthy
      ? t("healthReady", { schema: health.schema || "—" })
      : t("healthUnavailable");
  }

  function personActionMarkup(user) {
    const isOwner = state.me.role === "OWNER";
    const canChangeRole = isOwner && user.role !== "OWNER" && user.id !== state.me.id;
    const canManageBan = user.role !== "OWNER" && user.id !== state.me.id && (isOwner || user.role !== "ADMIN");
    const actions = [];
    if (canChangeRole) {
      actions.push(`<select class="compact-select" data-role-change="${escapeHtml(user.id)}" data-name="${escapeHtml(user.username)}" aria-label="${escapeHtml(t("changeRole"))}">
        <option value="USER" ${user.role === "USER" ? "selected" : ""}>${escapeHtml(t("member"))}</option>
        <option value="ADMIN" ${user.role === "ADMIN" ? "selected" : ""}>${escapeHtml(t("administrator"))}</option>
      </select>`);
    }
    if (canManageBan) {
      actions.push(`<button class="${user.isBanned ? "secondary-button" : "danger-button"} compact-action" type="button" data-user-ban="${escapeHtml(user.id)}" data-banned="${user.isBanned ? "0" : "1"}" data-name="${escapeHtml(user.username)}">${escapeHtml(user.isBanned ? t("restore") : t("suspend"))}</button>`);
    }
    return actions.length ? `<div class="person-actions">${actions.join("")}</div>` : `<div class="person-actions"><span class="person-meta">${escapeHtml(user.role === "OWNER" ? t("ownerOnly") : "—")}</span></div>`;
  }

  function renderPeople() {
    const users = state.people.items;
    if (!users.length) {
      els.peopleResults.innerHTML = `<div class="empty-state">${escapeHtml(t("noMatchingPeople"))}</div>`;
    } else {
      els.peopleResults.innerHTML = users.map((user) => {
        const email = state.people.canViewEmail ? (user.email || t("noEmail")) : t("contactHidden");
        const metadata = `${email} · ${t("joined", { date: dateFormat(user.createdAt) })}${user.lastLoginAt ? ` · ${t("lastSignedIn", { date: dateFormat(user.lastLoginAt) })}` : ""}`;
        return `<article class="person-card">
          <div class="person-name"><span class="avatar" aria-hidden="true">${escapeHtml((user.username || "?").slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(user.username)}</strong><div class="person-meta">${escapeHtml(metadata)}</div></div></div>
          <div><span class="mini-role ${escapeHtml(String(user.role || "USER").toLowerCase())}">${escapeHtml(roleLabel(user.role))}</span></div>
          <div><span class="status-label${user.isBanned ? " suspended" : ""}">${escapeHtml(user.isBanned ? t("suspended") : t("active"))}</span></div>
          ${personActionMarkup(user)}
        </article>`;
      }).join("");
    }
    els.peoplePrivacyNotice.textContent = state.people.canViewEmail ? t("emailOwnerOnly") : t("privacyShort");
    els.loadMorePeople.hidden = state.people.nextOffset === null;
  }

  function feedbackActionMarkup(suggestion) {
    const options = FEEDBACK_STATES.map((status) => (
      `<option value="${status}" ${suggestion.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`
    )).join("");
    return `<div class="feedback-action"><label>${escapeHtml(t("reviewState"))}<select class="compact-select" data-feedback-status="${escapeHtml(suggestion.id)}">${options}</select></label></div>`;
  }

  function renderFeedback() {
    const suggestions = state.feedback.items;
    els.feedbackResults.innerHTML = suggestions.length
      ? suggestions.map((suggestion) => {
        const contact = state.feedback.canViewEmail ? (suggestion.email || t("noEmail")) : t("contactHidden");
        return `<article class="feedback-card"><div class="feedback-copy"><p>${escapeHtml(suggestion.text)}</p><div class="feedback-meta">${escapeHtml(contact)} · ${escapeHtml(dateFormat(suggestion.createdAt))}</div></div>${feedbackActionMarkup(suggestion)}</article>`;
      }).join("")
      : `<div class="empty-state">${escapeHtml(t("noMatchingFeedback"))}</div>`;
    els.loadMoreFeedback.hidden = state.feedback.nextOffset === null;
  }

  function auditDescription(event) {
    const labels = {
      "user.role_changed": "auditRole",
      "user.banned": "auditBan",
      "user.unbanned": "auditUnban",
      "suggestion.status_changed": "auditFeedback",
      "security.password_reconfirmed": "auditReauth",
      "security.non_owner_sessions_revoked": "auditSessions",
    };
    return t(labels[event.action] || "auditGeneric");
  }

  function detailText(detail) {
    if (!detail) return "";
    try {
      const parsed = JSON.parse(detail);
      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
      }
    } catch { /* old audit entries may contain plain text */ }
    return String(detail);
  }

  function renderAudit() {
    const events = state.audit || [];
    els.auditResults.innerHTML = events.length
      ? events.map((event) => `<article class="audit-item"><span class="audit-marker" aria-hidden="true"></span><div><strong>${escapeHtml(event.actorUsername || "—")} ${escapeHtml(auditDescription(event))}</strong><p>${escapeHtml(detailText(event.detail) || t("actionTarget", { target: `${event.targetType || "—"}: ${event.targetId || "—"}` }))}</p><time datetime="${escapeHtml(event.createdAt || "")}">${escapeHtml(dateFormat(event.createdAt, true))}</time></div></article>`).join("")
      : `<div class="empty-state">${escapeHtml(t("noAuditEvents"))}</div>`;
  }

  function renderSecurity() {
    const stepUp = state.security?.stepUp || {};
    const confirmed = Boolean(stepUp.expiresAt && Date.parse(stepUp.expiresAt) > Date.now());
    els.stepUpPill.className = `status-pill ${confirmed ? "is-good" : "is-pending"}`;
    els.stepUpPill.textContent = t(confirmed ? "apiHealthy" : "confirmationRequired");
    els.stepUpMessage.textContent = confirmed
      ? t("confirmationValidUntil", { time: dateFormat(stepUp.expiresAt, true) })
      : t("confirmationNeeded");
    els.reauthenticateButton.textContent = t(confirmed ? "confirmIdentity" : "confirmPassword");
  }

  async function loadOverview() {
    const data = await api("/admin/overview");
    state.overview = data;
    renderOverview(data);
    return data;
  }

  async function loadHealth() {
    try {
      const data = await api("/health");
      state.health = data;
    } catch {
      state.health = { ok: false };
    }
    renderHealth(state.health);
  }

  function peopleQuery(offset) {
    const params = new URLSearchParams({ limit: "40", offset: String(offset) });
    const search = els.peopleSearch.value.trim();
    if (search) params.set("search", search);
    if (els.peopleRole.value) params.set("role", els.peopleRole.value);
    if (els.peopleStatus.value) params.set("status", els.peopleStatus.value);
    return `/admin/users?${params}`;
  }

  async function loadPeople(reset = true) {
    const offset = reset ? 0 : state.people.nextOffset;
    if (offset === null) return;
    if (reset) els.peopleResults.innerHTML = `<div class="loading-state">${escapeHtml(t("loading"))}</div>`;
    const data = await api(peopleQuery(offset));
    state.people = {
      items: reset ? data.users : [...state.people.items, ...data.users],
      nextOffset: data.nextOffset,
      canViewEmail: Boolean(data.permissions?.canViewEmail),
    };
    renderPeople();
  }

  function feedbackQuery(offset) {
    const params = new URLSearchParams({ limit: "40", offset: String(offset) });
    if (els.feedbackStatus.value) params.set("status", els.feedbackStatus.value);
    return `/admin/suggestions?${params}`;
  }

  async function loadFeedback(reset = true) {
    const offset = reset ? 0 : state.feedback.nextOffset;
    if (offset === null) return;
    if (reset) els.feedbackResults.innerHTML = `<div class="loading-state">${escapeHtml(t("loading"))}</div>`;
    const data = await api(feedbackQuery(offset));
    state.feedback = {
      items: reset ? data.suggestions : [...state.feedback.items, ...data.suggestions],
      nextOffset: data.nextOffset,
      canViewEmail: Boolean(data.permissions?.canViewEmail),
    };
    renderFeedback();
  }

  async function loadAudit() {
    if (state.me?.role !== "OWNER") return;
    els.auditResults.innerHTML = `<div class="loading-state">${escapeHtml(t("loading"))}</div>`;
    const data = await api("/admin/audit?limit=50");
    state.audit = data.events || [];
    renderAudit();
  }

  async function loadSecurity() {
    const data = await api("/admin/security");
    state.security = data;
    renderSecurity();
    return data;
  }

  async function refreshVisible(showMessage = false) {
    const tasks = [loadOverview(), loadHealth(), loadSecurity()];
    if (state.activeTab === "people") tasks.push(loadPeople(true));
    if (state.activeTab === "feedback") tasks.push(loadFeedback(true));
    if (state.activeTab === "audit" && state.me?.role === "OWNER") tasks.push(loadAudit());
    const results = await Promise.allSettled(tasks);
    const sessionFailure = results.find((result) => (
      result.status === "rejected"
      && result.reason instanceof AdminApiError
      && result.reason.status === 401
    ));
    if (sessionFailure) {
      handleActionError(sessionFailure.reason);
      return;
    }
    const failed = results.some((result) => result.status === "rejected");
    if (failed) showToast(t("requestFailed"), true);
    else if (showMessage) showToast(t("refreshComplete"));
  }

  async function establishAccess() {
    state.gateMode = "checking";
    renderGate();
    setConnection("is-pending", t("checkingAccess"));
    try {
      const profile = await api("/user/profile");
      if (!ADMIN_ROLES.has(profile.role)) {
        state.me = null;
        state.gateMode = "unauthorized";
        els.adminApp.hidden = true;
        renderGate();
        setConnection("is-error", t("unauthorizedTitle"));
        return;
      }
      state.me = profile;
      renderIdentity();
      showApp();
      setConnection("is-online", t("accessConnected"));
      await refreshVisible(false);
    } catch (error) {
      state.me = null;
      state.gateMode = error instanceof AdminApiError && error.status === 401 ? "signedOut" : "offline";
      els.adminApp.hidden = true;
      renderGate();
      setConnection("is-error", state.gateMode === "signedOut" ? t("sessionExpired") : t("offlineTitle"));
    }
  }

  function selectTab(tab, moveFocus = false) {
    if (tab === "audit" && state.me?.role !== "OWNER") return;
    state.activeTab = tab;
    $$("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      if (active && moveFocus) button.focus();
    });
    $$("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
    if (tab === "people" && !state.people.items.length) void loadPeople(true).catch(handleActionError);
    if (tab === "feedback" && !state.feedback.items.length) void loadFeedback(true).catch(handleActionError);
    if (tab === "audit" && !state.audit) void loadAudit().catch(handleActionError);
  }

  function handleActionError(error) {
    if (error instanceof AdminApiError) {
      if (error.status === 401 && error.code === "STEP_UP_REQUIRED") {
        state.security = null;
        showToast(t("highImpactConfirmation"), true);
        return;
      }
      if (error.status === 401) {
        state.gateMode = "signedOut";
        renderGate();
        els.adminApp.hidden = true;
        showToast(t("sessionExpired"), true);
        return;
      }
      showToast(error.message || t("requestFailed"), true);
      return;
    }
    showToast(t("requestFailed"), true);
  }

  function setButtonBusy(button, busy, original) {
    const isSelect = button instanceof HTMLSelectElement;
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    if (busy && !isSelect) {
      button.dataset.originalText = button.textContent;
      button.textContent = t("loading");
    } else if (!busy && !isSelect) {
      button.textContent = original || button.dataset.originalText || button.textContent;
      delete button.dataset.originalText;
    }
    if (!busy) button.removeAttribute("aria-busy");
  }

  function isStepUpCurrent() {
    const expiry = state.security?.stepUp?.expiresAt;
    return Boolean(expiry && Date.parse(expiry) > Date.now());
  }

  function requestStepUp(force = false) {
    if (!force && isStepUpCurrent()) return Promise.resolve(true);
    const dialog = els.reauthDialog;
    els.reauthPassword.value = "";
    els.reauthError.hidden = true;
    if (typeof dialog.showModal !== "function") {
      showToast(t("highImpactConfirmation"), true);
      return Promise.resolve(false);
    }
    dialog.showModal();
    setTimeout(() => els.reauthPassword.focus(), 0);
    return new Promise((resolve) => { state.stepUpResolver = resolve; });
  }

  function actionReviewReason() {
    return els.actionReviewReason.value
      .replace(/[\r\n]+/gu, " ")
      .replace(/\s{2,}/gu, " ")
      .trim()
      .slice(0, ACTION_REASON_MAX_LENGTH);
  }

  function mutationPayload(values, reason) {
    return JSON.stringify(reason ? { ...values, reason } : values);
  }

  function resetActionReview() {
    els.actionReviewForm.reset();
    els.actionReviewTypedConfirmationWrap.hidden = true;
    els.actionReviewTypedConfirmation.required = false;
    els.actionReviewTypedConfirmation.removeAttribute("aria-required");
    els.actionReviewTypedConfirmation.removeAttribute("aria-invalid");
    els.actionReviewTypedError.textContent = "";
    els.actionReviewTypedError.hidden = true;
  }

  function renderActionReview() {
    const review = state.actionReview;
    if (!review) return;
    const requiresTypedConfirmation = Boolean(review.requiresTypedConfirmation);
    els.actionReviewAction.textContent = t(review.actionKey);
    els.actionReviewTarget.textContent = review.target;
    els.actionReviewImpact.textContent = t(review.impactKey, review.impactValues);
    els.actionReviewTypedConfirmationWrap.hidden = !requiresTypedConfirmation;
    els.actionReviewTypedLead.textContent = requiresTypedConfirmation
      ? t("typedConfirmationLead", { token: ACTION_CONFIRMATION_TOKEN })
      : "";
    els.actionReviewTypedConfirmation.required = requiresTypedConfirmation;
    if (requiresTypedConfirmation) els.actionReviewTypedConfirmation.setAttribute("aria-required", "true");
    else els.actionReviewTypedConfirmation.removeAttribute("aria-required");
  }

  function requestActionReview(review) {
    const dialog = els.actionReviewDialog;
    if (typeof dialog.showModal !== "function" || dialog.open) {
      showToast(t("requestFailed"), true);
      return Promise.resolve(null);
    }
    state.actionReview = review;
    resetActionReview();
    renderActionReview();
    dialog.returnValue = "";
    try {
      dialog.showModal();
    } catch {
      state.actionReview = null;
      showToast(t("requestFailed"), true);
      return Promise.resolve(null);
    }
    const focusTarget = review.requiresTypedConfirmation ? els.actionReviewTypedConfirmation : els.actionReviewReason;
    setTimeout(() => focusTarget.focus(), 0);
    return new Promise((resolve) => { state.actionReviewResolver = resolve; });
  }

  function resolveActionReview() {
    const review = state.actionReview;
    const resolve = state.actionReviewResolver;
    const confirmed = els.actionReviewDialog.returnValue === "confirmed";
    const reason = confirmed ? actionReviewReason() : "";
    state.actionReview = null;
    state.actionReviewResolver = null;
    resetActionReview();
    if (resolve) resolve(confirmed && review ? { reason } : null);
  }

  function submitActionReview(event) {
    event.preventDefault();
    const review = state.actionReview;
    if (!review) return;
    if (review.requiresTypedConfirmation && els.actionReviewTypedConfirmation.value.trim() !== ACTION_CONFIRMATION_TOKEN) {
      els.actionReviewTypedError.textContent = t("typedConfirmationMismatch", { token: ACTION_CONFIRMATION_TOKEN });
      els.actionReviewTypedError.hidden = false;
      els.actionReviewTypedConfirmation.setAttribute("aria-invalid", "true");
      els.actionReviewTypedConfirmation.focus();
      return;
    }
    els.actionReviewDialog.close("confirmed");
  }

  function clearTypedConfirmationError() {
    els.actionReviewTypedError.hidden = true;
    els.actionReviewTypedConfirmation.removeAttribute("aria-invalid");
  }

  async function changeUserRole(select) {
    const userId = select.dataset.roleChange;
    const username = select.dataset.name || t("member");
    const role = select.value;
    if (!userId || !role) return;
    if (!await requestStepUp()) { await loadPeople(true); return; }
    const review = await requestActionReview({
      actionKey: "roleChangeAction",
      target: username,
      impactKey: "roleChangeImpact",
      impactValues: { role: roleLabel(role) },
    });
    if (!review) { await loadPeople(true); return; }
    setButtonBusy(select, true);
    try {
      await api(`/admin/users/${encodeURIComponent(userId)}/role`, { method: "PATCH", body: mutationPayload({ role }, review.reason) });
      showToast(t("roleUpdated"));
      await Promise.all([loadPeople(true), loadOverview(), loadSecurity()]);
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
      await loadPeople(true).catch(() => undefined);
    } finally {
      setButtonBusy(select, false);
    }
  }

  async function changeUserBan(button) {
    const userId = button.dataset.userBan;
    const username = button.dataset.name || t("member");
    const banned = button.dataset.banned === "1";
    if (!userId) return;
    if (!await requestStepUp()) return;
    const review = await requestActionReview({
      actionKey: banned ? "suspendAction" : "restoreAction",
      target: username,
      impactKey: banned ? "suspendImpact" : "restoreImpact",
      impactValues: {},
    });
    if (!review) return;
    setButtonBusy(button, true);
    try {
      await api(`/admin/users/${encodeURIComponent(userId)}/ban`, { method: "PATCH", body: mutationPayload({ banned }, review.reason) });
      showToast(t(banned ? "accessSuspended" : "accessRestored"));
      await Promise.all([loadPeople(true), loadOverview(), loadSecurity()]);
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function changeFeedbackStatus(select) {
    const suggestionId = select.dataset.feedbackStatus;
    if (!suggestionId) return;
    const status = select.value;
    setButtonBusy(select, true);
    try {
      await api(`/admin/suggestions/${encodeURIComponent(suggestionId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      showToast(t("feedbackUpdated"));
      await Promise.all([loadFeedback(true), loadOverview()]);
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
      await loadFeedback(true).catch(() => undefined);
    } finally {
      setButtonBusy(select, false);
    }
  }

  async function reauthenticate(event) {
    event.preventDefault();
    const password = els.reauthPassword.value;
    if (!password) {
      els.reauthError.textContent = t("passwordConfirmationFailed");
      els.reauthError.hidden = false;
      return;
    }
    setButtonBusy(els.reauthSubmit, true);
    els.reauthError.hidden = true;
    try {
      const data = await api("/admin/security/reauthenticate", { method: "POST", body: JSON.stringify({ password }) });
      state.security = { ...(state.security || {}), stepUp: data.stepUp };
      renderSecurity();
      els.reauthDialog.close("confirmed");
      showToast(t("passwordConfirmed"));
      if (state.audit) await loadAudit();
    } catch (error) {
      els.reauthError.textContent = error instanceof AdminApiError ? error.message : t("passwordConfirmationFailed");
      els.reauthError.hidden = false;
    } finally {
      setButtonBusy(els.reauthSubmit, false);
    }
  }

  async function revokeSessions(button) {
    if (!await requestStepUp()) return;
    const review = await requestActionReview({
      actionKey: "revokeSessionsAction",
      target: t("allNonOwnerAccounts"),
      impactKey: "revokeSessionsImpact",
      impactValues: {},
      requiresTypedConfirmation: true,
    });
    if (!review) return;
    setButtonBusy(button, true);
    try {
      const result = await api("/admin/security/revoke-non-owner-sessions", { method: "POST", body: mutationPayload({}, review.reason) });
      showToast(t("sessionsRevoked", { count: numberFormat(result.revokedSessions) }));
      await Promise.all([loadOverview(), loadSecurity()]);
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
    } finally {
      setButtonBusy(button, false);
    }
  }

  function bindEvents() {
    els.languageToggle.addEventListener("click", () => {
      state.lang = state.lang === "ar" ? "en" : "ar";
      persistLanguage();
      applyLanguage();
    });
    els.refreshButton.addEventListener("click", () => void refreshVisible(true));
    els.logoutButton.addEventListener("click", async () => {
      try { await api("/auth/logout", { method: "POST", body: "{}" }); } catch { /* local navigation still clears the static UI */ }
      location.assign(state.lang === "ar" ? "/?lang=ar" : "/");
    });
    els.adminTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (button) selectTab(button.dataset.tab);
    });
    els.adminTabs.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = $$("#adminTabs [data-tab]").filter((tab) => !tab.hidden);
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else next = (current + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next].dataset.tab, true);
    });
    document.addEventListener("click", (event) => {
      const open = event.target.closest("[data-open-tab]");
      if (open) selectTab(open.dataset.openTab);
      const ban = event.target.closest("[data-user-ban]");
      if (ban) void changeUserBan(ban);
    });
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches("[data-role-change]")) void changeUserRole(target);
      if (target.matches("[data-feedback-status]")) void changeFeedbackStatus(target);
    });
    els.peopleSearchButton.addEventListener("click", () => void loadPeople(true).catch(handleActionError));
    els.peopleSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); void loadPeople(true).catch(handleActionError); }
    });
    els.loadMorePeople.addEventListener("click", () => void loadPeople(false).catch(handleActionError));
    els.feedbackFilterButton.addEventListener("click", () => void loadFeedback(true).catch(handleActionError));
    els.loadMoreFeedback.addEventListener("click", () => void loadFeedback(false).catch(handleActionError));
    els.reloadAudit.addEventListener("click", () => void loadAudit().catch(handleActionError));
    els.reauthenticateButton.addEventListener("click", () => void requestStepUp(true));
    els.revokeSessionsButton.addEventListener("click", () => void revokeSessions(els.revokeSessionsButton));
    els.reauthForm.addEventListener("submit", reauthenticate);
    els.reauthCancel.addEventListener("click", () => els.reauthDialog.close("cancelled"));
    els.reauthDialog.addEventListener("close", () => {
      const resolve = state.stepUpResolver;
      state.stepUpResolver = null;
      if (resolve) resolve(els.reauthDialog.returnValue === "confirmed");
    });
    els.actionReviewForm.addEventListener("submit", submitActionReview);
    els.actionReviewCancel.addEventListener("click", () => els.actionReviewDialog.close("cancelled"));
    els.actionReviewTypedConfirmation.addEventListener("input", clearTypedConfirmationError);
    els.actionReviewDialog.addEventListener("close", resolveActionReview);
  }

  function cacheElements() {
    [
      "connectionState", "languageToggle", "viewSite", "refreshButton", "logoutButton",
      "gate", "gateTitle", "gateMessage", "gateActions", "adminApp", "identityAvatar", "identityName", "identityRole",
      "auditTab", "sessionControlCard", "adminTabs", "metricGrid", "feedbackCount", "lastUpdated", "healthPill", "healthMessage",
      "actionQueue", "recentUsers", "recentSuggestions", "peopleSearch", "peopleRole", "peopleStatus", "peopleSearchButton",
      "peoplePrivacyNotice", "peopleResults", "loadMorePeople", "feedbackStatus", "feedbackFilterButton", "feedbackResults", "loadMoreFeedback",
      "reloadAudit", "auditResults", "stepUpPill", "stepUpMessage", "reauthenticateButton", "revokeSessionsButton",
      "reauthDialog", "reauthForm", "reauthPassword", "reauthError", "reauthSubmit", "reauthCancel", "toastRegion",
      "actionReviewDialog", "actionReviewForm", "actionReviewAction", "actionReviewTarget", "actionReviewImpact", "actionReviewReason",
      "actionReviewTypedConfirmationWrap", "actionReviewTypedLead", "actionReviewTypedConfirmation", "actionReviewTypedError",
      "actionReviewConfirm", "actionReviewCancel",
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    applyLanguage();
    bindEvents();
    void establishAccess();
  });
})();
