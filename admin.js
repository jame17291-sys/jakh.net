(() => {
  "use strict";

  const ADMIN_CONFIG = globalThis.RIDDLE_ARABIA_ADMIN_CONFIG || Object.freeze({
    apiOrigin: "https://api.riddlearabia.com/api",
    environment: "production",
  });
  const API = ADMIN_CONFIG.apiOrigin;
  const ADMIN_ROLES = new Set(["ADMIN", "OWNER"]);
  const ROLE_KEYS = Object.freeze({ USER: "member", ADMIN: "administrator", OWNER: "owner" });
  const FEEDBACK_STATES = ["new", "reviewed", "implemented", "rejected"];
  const ACTION_CONFIRMATION_TOKEN = "REVOKE";
  const ACTION_REASON_MAX_LENGTH = 280;
  const PLATFORM_SOURCE_FALLBACKS = Object.freeze([
    { id: "cloudflare", state: "manual", link: { url: "https://dash.cloudflare.com/" }, metrics: [] },
    { id: "github", state: "manual", link: { url: "https://github.com/jame17291-sys/jakh.net/actions" }, metrics: [] },
    { id: "google-analytics", state: "not_configured", link: { url: "https://analytics.google.com/analytics/web/" }, metrics: [] },
    { id: "godaddy", state: "not_configured", link: { url: "https://dcc.godaddy.com/domains" }, metrics: [] },
    { id: "search-console", state: "not_configured", link: { url: "https://search.google.com/search-console" }, metrics: [] },
  ]);
  const PLATFORM_SOURCE_COPY = Object.freeze({
    cloudflare: { label: "Cloudflare", category: "platformCloudflareCategory", manualDetail: "platformCloudflareManual", unconfiguredDetail: "platformCloudflareUnconfigured", url: "https://dash.cloudflare.com/" },
    github: { label: "GitHub", category: "platformGithubCategory", manualDetail: "platformGithubManual", url: "https://github.com/jame17291-sys/jakh.net/actions" },
    "google-analytics": { label: "Google Analytics 4", category: "platformGoogleAnalyticsCategory", unconfiguredDetail: "platformGoogleAnalyticsUnconfigured", url: "https://analytics.google.com/analytics/web/" },
    godaddy: { label: "GoDaddy", category: "platformGodaddyCategory", unconfiguredDetail: "platformGodaddyUnconfigured", url: "https://dcc.godaddy.com/domains" },
    "search-console": { label: "Google Search Console", category: "platformSearchConsoleCategory", unconfiguredDetail: "platformSearchConsoleUnconfigured", url: "https://search.google.com/search-console" },
  });
  const PLATFORM_METRIC_COPY = Object.freeze({
    "registered-users": ["platformRegisteredUsers", "platformRegisteredUsersDetail"],
    administrators: ["platformAdministrators", "platformAdministratorsDetail"],
    "active-sessions": ["platformActiveSessions", "platformActiveSessionsDetail"],
    "completed-progress": ["platformCompletedProgress", "platformCompletedProgressDetail"],
    "pending-suggestions": ["platformPendingSuggestions", "platformPendingSuggestionsDetail"],
    "suspended-users": ["platformSuspendedUsers", "platformSuspendedUsersDetail"],
    "consented-usage-minutes": ["platformConsentedUsage", "platformConsentedUsageDetail"],
    "content-drafts": ["platformContentDrafts", "platformContentDraftsDetail"],
    "content-in-review": ["platformContentReview", "platformContentReviewDetail"],
    "published-content-overrides": ["platformPublishedOverrides", "platformPublishedOverridesDetail"],
    "cloudflare-edge-requests-24h": ["platformCloudflareEdgeRequests", "platformCloudflareEdgeRequestsDetail"],
    "cloudflare-visits-24h": ["platformCloudflareVisits", "platformCloudflareVisitsDetail"],
    "cloudflare-edge-data-transfer-24h": ["platformCloudflareDataTransfer", "platformCloudflareDataTransferDetail"],
    "cloudflare-api-worker-requests-24h": ["platformCloudflareApiRequests", "platformCloudflareApiRequestsDetail"],
    "cloudflare-api-worker-errors-24h": ["platformCloudflareApiErrors", "platformCloudflareApiErrorsDetail"],
    "cloudflare-site-worker-requests-24h": ["platformCloudflareSiteRequests", "platformCloudflareSiteRequestsDetail"],
    "cloudflare-site-worker-errors-24h": ["platformCloudflareSiteErrors", "platformCloudflareSiteErrorsDetail"],
  });

  const COPY = {
    en: {
      skipToMain: "Skip to main content",
      brandEyebrow: "RIDDLE ARABIA · ADMINISTRATION",
      checkingAccess: "Checking access…",
      viewSite: "View site",
      refresh: "Refresh",
      signOut: "Sign out",
      signOutFailed: "Could not sign out. This admin session is still active; check your connection and try again.",
      secureAdmin: "Secure administration",
      checkingAccessTitle: "Checking your access",
      checkingAccessMessage: "We are verifying your signed-in Riddle Arabia account and role.",
      tryAgain: "Try again",
      adminScope: "Administration applies only to Riddle Arabia accounts and riddlearabia.com operations.",
      overview: "Overview",
      contentStudio: "Content",
      editorialWorkspace: "Editorial workspace",
      contentHeading: "Content",
      contentLead: "Find a question, edit both languages, and send it for review.",
      contentCategory: "Category",
      chooseCategory: "Choose a category",
      searchQuestions: "Search questions",
      contentSearchPlaceholder: "Question ID, English or Arabic text",
      allContentStates: "All states",
      unedited: "Unedited",
      draft: "Draft",
      inReview: "In review",
      published: "Published",
      loadQuestions: "Refresh results",
      questionLibrary: "Question library",
      chooseCategoryFirst: "Choose a category to begin.",
      chooseQuestion: "Choose a question to open the bilingual editor.",
      history: "History",
      question: "Question",
      answer: "Answer",
      explanation: "Explanation",
      sourcesFormat: "Sources — one per line: Title | Publisher | https://…",
      livePreview: "Preview",
      saveDraft: "Save draft",
      submitForReview: "Submit for review",
      publish: "Publish",
      unpublish: "Unpublish",
      revisionHistory: "Revision history",
      contentLoaded: "Loaded {count} questions.",
      noMatchingQuestions: "No questions match these filters.",
      contentSaved: "Draft saved.",
      contentSubmitted: "Draft submitted for review.",
      contentPublished: "The approved version is live.",
      contentUnpublished: "The published override was removed; the static version is live again.",
      contentRestored: "Revision restored as a new draft.",
      independentReviewRequired: "Another administrator must publish content you authored.",
      ownerOverrideReview: "Owner override: add an audit reason before publishing your own content.",
      restoreRevision: "Restore",
      invalidSources: "Write each source as Title | Publisher | https://…",
      contentRequired: "English and Arabic questions and answers are required.",
      people: "People",
      feedback: "Feedback",
      auditLog: "Activity",
      security: "Security",
      operations: "Operations",
      overviewHeading: "Overview",
      overviewLead: "Review feedback and drafts, then continue recent edits.",
      updated: "Updated",
      serviceReadiness: "Service readiness",
      productionStatus: "Production status",
      checking: "Checking",
      healthChecking: "Checking the Riddle Arabia API and database schema.",
      guardrailRoles: "Server-enforced Riddle Arabia roles",
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
      peopleHeading: "People and permissions",
      peopleLead: "Search accounts, account status, and make deliberate access decisions. Owner accounts remain protected.",
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
      feedbackHeading: "Feedback",
      feedbackLead: "Triage incoming ideas with a visible, auditable review state.",
      reviewState: "Review state",
      allFeedback: "All feedback",
      new: "New",
      reviewed: "Reviewed",
      implemented: "Implemented",
      rejected: "Rejected",
      ownerOnly: "Owner-only",
      auditHeading: "Activity",
      auditLead: "Review the latest role, access, moderation, and session-security changes.",
      refreshLog: "Refresh log",
      securityHeading: "Security",
      securityLead: "Your active Riddle Arabia session is protected; password confirmation is required before high-impact administrative changes.",
      stepUp: "Step-up confirmation",
      confirmIdentity: "Confirm your identity",
      confirmationRequired: "Confirmation required",
      stepUpDescription: "Confirm your password to unlock role changes, suspensions, and session-wide security actions for ten minutes.",
      confirmPassword: "Confirm password",
      builtInSafeguards: "Built-in safeguards",
      securityControls: "Security controls",
      safeguardOne: "Riddle Arabia roles are checked by the API, not the browser.",
      safeguardTwo: "Owner role changes and administrator suspension are owner-restricted.",
      safeguardThree: "Access changes end affected sessions and create an audit event.",
      sessionControl: "Session control",
      sessionControlLead: "End every active session held by non-owner accounts. Your owner session stays signed in.",
      revokeSessions: "Sign out non-owner sessions",
      reauthTitle: "Confirm it is you",
      reauthLead: "Enter your current Riddle Arabia password. It is used only to confirm this session and is never stored by the console.",
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
      awaitingReview: "needs attention",
      accessRestricted: "access restricted",
      apiHealthy: "Operational",
      apiUnhealthy: "Needs attention",
      healthReady: "Riddle Arabia API is responding and schema {schema} is ready.",
      healthUnavailable: "The production health check could not be completed. Try refreshing before taking action.",
      feedbackAwaiting: "new feedback items",
      accountsSuspended: "accounts currently suspended",
      allCaughtUp: "No new feedback.",
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
      reasonRequired: "Reason (required)",
      reasonRequiredHint: "A short operational reason is required and will be recorded in the audit log.",
      reasonRequiredMessage: "Add a short operational reason before continuing.",
      typedConfirmation: "Confirmation required",
      typedConfirmationLead: "Type {token} to sign out every non-owner session.",
      typedConfirmationInput: "Type the confirmation phrase",
      typedConfirmationMismatch: "Type {token} exactly before confirming this action.",
      confirmAction: "Confirm action",
      roleChangeAction: "Change role",
      suspendAction: "Suspend account",
      restoreAction: "Restore access",
      revokeSessionsAction: "Sign out non-owner sessions",
      publishAction: "Publish content",
      unpublishAction: "Unpublish content",
      restoreContentAction: "Restore revision",
      feedbackStateAction: "Update feedback state",
      roleChangeImpact: "The role will change to {role}, and active sessions will end.",
      suspendImpact: "The account will be suspended and active sessions will end immediately.",
      restoreImpact: "The account will regain access. Ended sessions remain ended.",
      revokeSessionsImpact: "Every active non-owner session will end. This cannot be undone; your owner session stays signed in.",
      publishImpact: "Version {version} will become the live content for all visitors immediately.",
      unpublishImpact: "The published version will be removed and the static version will return.",
      restoreContentImpact: "Revision {version} will replace this draft. It will not go live until it is independently reviewed and published.",
      feedbackStateImpact: "This feedback item will be marked {status}.",
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
      signedOutTitle: "Sign in to manage Riddle Arabia",
      signedOutMessage: "Use your Riddle Arabia owner or administrator account. We will bring you back to this console after sign-in.",
      signInToJakh: "Sign in to Riddle Arabia",
      unauthorizedTitle: "This account does not have admin access",
      unauthorizedMessage: "You are signed in, but this Riddle Arabia account is not an administrator or owner. Ask an owner to review your role.",
      returnToSite: "Return to Riddle Arabia",
      offlineTitle: "The admin service is unavailable",
      offlineMessage: "We could not reach the Riddle Arabia administration API. Check your connection and try again.",
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
      auditContent: "changed editorial content",
      auditGeneric: "performed a privileged action",
      actionTarget: "Target: {target}",
      switchLanguage: "Switch language",
      refreshComplete: "Console refreshed.",
      privacyShort: "Contact data is restricted to owners.",
    },
    ar: {
      skipToMain: "انتقل إلى المحتوى الرئيسي",
      brandEyebrow: "RIDDLE ARABIA · الإدارة",
      checkingAccess: "جارٍ التحقق من الوصول…",
      viewSite: "عرض الموقع",
      refresh: "تحديث",
      signOut: "تسجيل الخروج",
      signOutFailed: "تعذر تسجيل الخروج. ما زالت جلسة الإدارة نشطة؛ تحقق من الاتصال وحاول مرة أخرى.",
      secureAdmin: "إدارة آمنة",
      checkingAccessTitle: "جارٍ التحقق من صلاحياتك",
      checkingAccessMessage: "نتحقق من حساب Riddle Arabia المسجل ودوره.",
      tryAgain: "حاول مجدداً",
      adminScope: "تنطبق الإدارة على حسابات Riddle Arabia وعمليات riddlearabia.com فقط.",
      overview: "نظرة عامة",
      contentStudio: "المحتوى",
      editorialWorkspace: "مساحة التحرير",
      contentHeading: "المحتوى",
      contentLead: "ابحث عن سؤال، وحرره باللغتين، ثم أرسله للمراجعة.",
      contentCategory: "الموضوع",
      chooseCategory: "اختر موضوعًا",
      searchQuestions: "البحث في الأسئلة",
      contentSearchPlaceholder: "معرّف السؤال أو نص بالعربية أو الإنجليزية",
      allContentStates: "كل الحالات",
      unedited: "من دون تعديل",
      draft: "مسودة",
      inReview: "قيد المراجعة",
      published: "منشور",
      loadQuestions: "تحديث النتائج",
      questionLibrary: "مكتبة الأسئلة",
      chooseCategoryFirst: "اختر موضوعًا للبدء.",
      chooseQuestion: "اختر سؤالًا لفتح محرر العربية والإنجليزية.",
      history: "السجل",
      question: "السؤال",
      answer: "الإجابة",
      explanation: "الشرح",
      sourcesFormat: "المصادر — مصدر في كل سطر: العنوان | الناشر | https://…",
      livePreview: "المعاينة",
      saveDraft: "حفظ المسودة",
      submitForReview: "إرسال للمراجعة",
      publish: "نشر",
      unpublish: "إلغاء النشر",
      revisionHistory: "سجل النسخ",
      contentLoaded: "تم تحميل {count} سؤالًا.",
      noMatchingQuestions: "لا توجد أسئلة تطابق هذه المرشحات.",
      contentSaved: "حُفظت المسودة.",
      contentSubmitted: "أُرسلت المسودة للمراجعة.",
      contentPublished: "أصبحت النسخة المعتمدة منشورة.",
      contentUnpublished: "أُلغي التعديل المنشور، وعادت النسخة الأساسية للعرض.",
      contentRestored: "أُعيدت النسخة السابقة في مسودة جديدة.",
      independentReviewRequired: "يلزم أن ينشر مسؤول آخر المحتوى الذي أنشأته.",
      ownerOverrideReview: "تجاوز المالك: أضف سبباً للتدقيق قبل نشر المحتوى الذي أنشأته.",
      restoreRevision: "استعادة",
      invalidSources: "اكتب كل مصدر بهذه الصيغة: العنوان | الناشر | https://…",
      contentRequired: "يلزم إدخال السؤال والإجابة بالعربية والإنجليزية.",
      people: "الأشخاص",
      feedback: "الملاحظات",
      auditLog: "النشاط",
      security: "الأمان",
      operations: "العمليات",
      overviewHeading: "نظرة عامة",
      overviewLead: "راجع الملاحظات والمسودات، وتابع التعديلات الأخيرة.",
      updated: "تم التحديث",
      serviceReadiness: "جاهزية الخدمة",
      productionStatus: "حالة الإنتاج",
      checking: "جارٍ التحقق",
      healthChecking: "جارٍ فحص واجهة Riddle Arabia وقاعدة البيانات.",
      guardrailRoles: "أدوار Riddle Arabia مفروضة من الخادم",
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
      peopleHeading: "الأشخاص والصلاحيات",
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
      feedbackHeading: "الملاحظات",
      feedbackLead: "فرز الأفكار الواردة مع حالة مراجعة مرئية وقابلة للتدقيق.",
      reviewState: "حالة المراجعة",
      allFeedback: "كل الملاحظات",
      new: "جديد",
      reviewed: "تمت المراجعة",
      implemented: "تم التنفيذ",
      rejected: "مرفوض",
      ownerOnly: "للمالك فقط",
      auditHeading: "النشاط",
      auditLead: "راجع أحدث تغييرات الأدوار والوصول والمراجعة وأمان الجلسات.",
      refreshLog: "تحديث السجل",
      securityHeading: "الأمان",
      securityLead: "جلسة Riddle Arabia الحالية محمية؛ يلزم تأكيد كلمة المرور قبل الإجراءات الإدارية المؤثرة.",
      stepUp: "تأكيد إضافي",
      confirmIdentity: "أكد هويتك",
      confirmationRequired: "يلزم التأكيد",
      stepUpDescription: "أكد كلمة مرورك لفتح تغييرات الأدوار والإيقاف وإجراءات أمان الجلسات لمدة عشر دقائق.",
      confirmPassword: "تأكيد كلمة المرور",
      builtInSafeguards: "ضوابط مدمجة",
      securityControls: "ضوابط الأمان",
      safeguardOne: "يتحقق الخادم من أدوار Riddle Arabia وليس المتصفح.",
      safeguardTwo: "تغييرات دور المالك وإيقاف المسؤولين مقيدة بالمالك.",
      safeguardThree: "تغييرات الوصول تنهي الجلسات المتأثرة وتنشئ حدث تدقيق.",
      sessionControl: "التحكم بالجلسات",
      sessionControlLead: "إنهاء كل الجلسات النشطة للحسابات غير المالكة. تبقى جلسة المالك مسجلة.",
      revokeSessions: "تسجيل خروج جلسات غير المالك",
      reauthTitle: "أكد أنك أنت",
      reauthLead: "أدخل كلمة مرور Riddle Arabia الحالية. تُستخدم فقط لتأكيد هذه الجلسة ولا تخزنها اللوحة.",
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
      awaitingReview: "تحتاج انتباهاً",
      accessRestricted: "وصول مقيّد",
      apiHealthy: "تعمل",
      apiUnhealthy: "تحتاج انتباهاً",
      healthReady: "واجهة Riddle Arabia تعمل وإصدار المخطط {schema} جاهز.",
      healthUnavailable: "تعذر إكمال فحص الإنتاج. حدّث الصفحة قبل تنفيذ أي إجراء.",
      feedbackAwaiting: "ملاحظات جديدة",
      accountsSuspended: "حسابات معلقة حالياً",
      allCaughtUp: "لا توجد ملاحظات جديدة.",
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
      reasonRequired: "السبب (مطلوب)",
      reasonRequiredHint: "يلزم سبب تشغيلي مختصر وسيُسجل في سجل التدقيق.",
      reasonRequiredMessage: "أضف سبباً تشغيلياً مختصراً قبل المتابعة.",
      typedConfirmation: "يلزم تأكيد إضافي",
      typedConfirmationLead: "اكتب {token} لتسجيل خروج كل جلسات غير المالك.",
      typedConfirmationInput: "اكتب عبارة التأكيد",
      typedConfirmationMismatch: "اكتب {token} تماماً قبل تأكيد هذا الإجراء.",
      confirmAction: "تأكيد الإجراء",
      roleChangeAction: "تغيير الدور",
      suspendAction: "تعليق الحساب",
      restoreAction: "استعادة الوصول",
      revokeSessionsAction: "تسجيل خروج جلسات غير المالك",
      publishAction: "نشر المحتوى",
      unpublishAction: "إلغاء نشر المحتوى",
      restoreContentAction: "استعادة نسخة",
      feedbackStateAction: "تحديث حالة الملاحظة",
      roleChangeImpact: "سيتغير الدور إلى {role} وستنتهي الجلسات النشطة.",
      suspendImpact: "سيُعلّق الحساب وتنتهي جلساته النشطة فوراً.",
      restoreImpact: "سيستعيد الحساب الوصول. تبقى الجلسات المنتهية منتهية.",
      revokeSessionsImpact: "ستنتهي كل جلسات غير المالك النشطة. لا يمكن التراجع عن ذلك؛ تبقى جلسة المالك مسجلة.",
      publishImpact: "ستصبح النسخة {version} المحتوى الظاهر لجميع الزوار فوراً.",
      unpublishImpact: "ستُزال النسخة المنشورة وتعود النسخة الأساسية للعرض.",
      restoreContentImpact: "ستستبدل النسخة {version} هذه المسودة، ولن تظهر للزوار حتى تُراجع بصورة مستقلة وتُنشر.",
      feedbackStateImpact: "ستُحدد حالة هذه الملاحظة بأنها {status}.",
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
      signedOutTitle: "سجل الدخول لإدارة Riddle Arabia",
      signedOutMessage: "استخدم حساب مالك أو مسؤول Riddle Arabia. سنعيدك إلى هذه اللوحة بعد تسجيل الدخول.",
      signInToJakh: "تسجيل الدخول إلى Riddle Arabia",
      unauthorizedTitle: "هذا الحساب لا يملك صلاحية الإدارة",
      unauthorizedMessage: "أنت مسجل الدخول، لكن حساب Riddle Arabia هذا ليس مسؤولاً أو مالكاً. اطلب من مالك مراجعة دورك.",
      returnToSite: "العودة إلى Riddle Arabia",
      offlineTitle: "خدمة الإدارة غير متاحة",
      offlineMessage: "تعذر الوصول إلى واجهة إدارة Riddle Arabia. تحقق من الاتصال وحاول مجدداً.",
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
      auditContent: "غيّر محتوى تحريريًا",
      auditGeneric: "نفّذ إجراء ذا صلاحية عالية",
      actionTarget: "الهدف: {target}",
      switchLanguage: "تغيير اللغة",
      refreshComplete: "تم تحديث اللوحة.",
      privacyShort: "بيانات التواصل مقيدة للمالكين.",
    },
  };

  Object.assign(COPY.en, {
    adminNavigation: "Administration navigation", adminSections: "Administration sections", siteHome: "Riddle Arabia home", editorialWork: "Editorial work", accountMetrics: "Account metrics",
    editorialUnavailable: "Editorial data is temporarily unavailable. Refresh to try again.", liveOverrides: "Live overrides", browseContent: "Browse content", categorySearch: "Find a category", categorySearchPlaceholder: "Category name",
    allCategories: "All categories", clearFilters: "Clear filters", pageSize: "Per page",
    previousPage: "Previous", nextPage: "Next", backToResults: "Back to results",
    editorLanguage: "Editing language", english: "English", arabic: "العربية", compareLanguages: "Compare",
    previewLanguage: "Preview language", sources: "Sources", sourcesHint: "Add up to 8 sources. Each needs a title, publisher, and unique HTTPS address.",
    addSource: "Add source", removeSource: "Remove source {number}", sourceTitle: "Title", sourcePublisher: "Publisher", sourceUrl: "HTTPS address",
    saveState: "Saved", unsavedChanges: "Unsaved changes", savingDraft: "Saving…", savedWithChanges: "Saved version; newer changes are unsaved.",
    discardChanges: "You have unsaved changes. Discard them and continue?",
    keepChanges: "You have unsaved changes. Continue with these changes kept in the editor?",
    saveBeforePublish: "Save or discard your changes before publishing the saved version.",
    publishedOverride: "Live: published override v{version}", staticLive: "Live: original question",
    contentPublishedState: "Live version", draftStatus: "Editorial: {status}",
    pageSummary: "{from}–{to} of {count} questions", pageNumber: "Page {page} of {pages}",
    noCategories: "No matching categories", invalidSources: "Each source needs a title, publisher, and a unique HTTPS address (maximum 8).",
    recentEdits: "Recent edits", recentEditsHint: "Continue where you left off", noRecentEdits: "No editorial changes yet.",
    accountActivity: "Account activity", draftCount: "Drafts", pendingReview: "Pending review", publishedOverrides: "Published overrides",
    reviewDrafts: "Review drafts", feedbackQueue: "Reported questions and feedback", editorialQueue: "Ready for review",
    openQuestion: "Open question", returnToFeedback: "Return to feedback", resolutionNote: "Resolution note", saveNote: "Save note",
    notePlaceholder: "Describe the correction or explain the decision", noteRequired: "Add a resolution note before saving.", noteSaved: "Resolution note saved.",
    reportContext: "Question report", reportedWording: "Reported wording", currentWording: "Current wording",
    reportMismatch: "The reported wording differs from the current question. Verify the question ID before making a correction.",
    reportMatches: "The report matches the current question (reports may be shortened).",
    reportMissing: "This question could not be found in the reported category. The report is retained for investigation.",
    reportInvalid: "This report does not contain a valid category and question ID.",
    contentSearchFailed: "Could not load the complete question library. Refresh results to try again.",
    allCaughtUp: "No feedback or drafts awaiting review.",
    platformStatus: "Platform status", platformStatusHeading: "Platform status",
    platformStatusLead: "A single, private view of Riddle Arabia’s first-party activity and connected provider checks.",
    platformRefresh: "Refresh status", platformSnapshot: "Status snapshot", platformChecking: "Checking platform connections…",
    platformStatusWaiting: "Status details will appear when the secure snapshot is ready.",
    platformSnapshotUpdated: "Snapshot updated", platformDataScope: "Data scope", platformDataScopeValue: "Server-side, read-only",
    platformMetricsHeading: "Riddle Arabia usage", platformMetricsLead: "First-party account and game activity; consent-limited where applicable.",
    platformSourcesHeading: "Platform sources", platformSourcesLead: "Open a provider console only when a card needs a closer look.",
    platformPrivacyNote: "Provider credentials never reach this browser. Statuses are read from a server-side, read-only snapshot.",
    platformOverallHealthy: "Riddle Arabia is operating normally", platformOverallHealthyDetail: "The owner-only API and first-party aggregate snapshot completed successfully.", platformOverallAttention: "A platform needs attention", platformOverallAttentionDetail: "The aggregate snapshot completed, but the service schema needs attention.", platformOverallUnavailable: "Platform status is unavailable", platformRefreshRetainedHeadline: "Latest refresh failed", platformRefreshRetainedDetail: "Showing the last successful status snapshot. Try refreshing again.",
    platformStateHealthy: "Operational", platformStatePartial: "Partial data", platformStateAttention: "Needs attention", platformStateManual: "Manual check", platformStateUnconfigured: "Not connected", platformStateStale: "Stale", platformStateUnknown: "Unknown", platformStateChecking: "Checking",
    platformUnavailable: "Platform status could not be loaded. Try again.", platformNoMetrics: "No first-party usage metrics are available yet.",
    platformNoSources: "No provider source cards are available yet.", platformNoFreshness: "No snapshot time", platformObserved: "Observed {date}",
    platformManualHeadline: "Open the provider console to verify this source", platformManualDetail: "This connection is intentionally checked in the provider console; the admin page does not receive provider credentials.",
    platformNotConfiguredHeadline: "Reporting is not connected", platformNotConfiguredDetail: "A read-only reporting connection can be added later. Until then, use the provider console directly.",
    platformOpenDashboard: "Open dashboard", platformMetricUnavailable: "—",
    platformRegisteredUsers: "Registered users", platformRegisteredUsersDetail: "All account records",
    platformAdministrators: "Administrators", platformAdministratorsDetail: "Owner and administrator accounts",
    platformActiveSessions: "Active sessions", platformActiveSessionsDetail: "Currently signed in",
    platformCompletedProgress: "Completed rounds", platformCompletedProgressDetail: "First-party game progress",
    platformPendingSuggestions: "New feedback", platformPendingSuggestionsDetail: "Awaiting review",
    platformSuspendedUsers: "Restricted accounts", platformSuspendedUsersDetail: "Access restricted",
    platformConsentedUsage: "Consented usage", platformConsentedUsageDetail: "Signed-in, consented minutes",
    platformContentDrafts: "Content drafts", platformContentDraftsDetail: "Editorial workspace",
    platformContentReview: "Content in review", platformContentReviewDetail: "Editorial workspace",
    platformPublishedOverrides: "Live overrides", platformPublishedOverridesDetail: "Published content changes",
    platformCloudflareEdgeRequests: "Edge requests", platformCloudflareEdgeRequestsDetail: "End users · last 24 hours",
    platformCloudflareVisits: "Cloudflare visits", platformCloudflareVisitsDetail: "Direct or referral visits · last 24 hours",
    platformCloudflareDataTransfer: "Data transfer", platformCloudflareDataTransferDetail: "Edge responses · last 24 hours",
    platformCloudflareApiRequests: "API Worker requests", platformCloudflareApiRequestsDetail: "jakh-api · last 24 hours",
    platformCloudflareApiErrors: "API Worker errors", platformCloudflareApiErrorsDetail: "Worker invocation errors · last 24 hours",
    platformCloudflareSiteRequests: "Site Worker requests", platformCloudflareSiteRequestsDetail: "jakh-site · last 24 hours",
    platformCloudflareSiteErrors: "Site Worker errors", platformCloudflareSiteErrorsDetail: "Worker invocation errors · last 24 hours",
    platformCloudflareCategory: "Traffic and infrastructure", platformGithubCategory: "Delivery and monitoring", platformGoogleAnalyticsCategory: "Audience and engagement", platformGodaddyCategory: "Domain and registrar", platformSearchConsoleCategory: "Search visibility",
    platformCloudflareManual: "The Cloudflare API runtime is available here; traffic and edge analytics remain a provider-console check.",
    platformCloudflareUnconfigured: "The dedicated read-only Cloudflare analytics connection has not been configured yet.",
    platformCloudflareLiveHeadline: "Cloudflare analytics is current", platformCloudflareLiveDetail: "Rolling 24-hour edge and Worker aggregates are available through the secure server-side connection.",
    platformCloudflarePartialHeadline: "Cloudflare analytics is partially available", platformCloudflarePartialDetail: "Current aggregates are shown, but one or more requested data sets had no results. Shown values remain valid.",
    platformCloudflareStaleHeadline: "Cloudflare analytics needs a refresh", platformCloudflareStaleDetail: "The last successful Cloudflare aggregate snapshot is displayed while the provider refreshes.", platformCloudflareStalePartialDetail: "The last successful partial Cloudflare snapshot is displayed while the provider refreshes.",
    platformCloudflareUnavailableHeadline: "Cloudflare analytics is temporarily unavailable", platformCloudflareUnavailableDetail: "No usable Cloudflare aggregate snapshot was returned. The website itself may still be operating normally.",
    platformGithubManual: "GitHub Actions and production monitoring remain a provider-console check.",
    platformGoogleAnalyticsUnconfigured: "Consent-gated collection is present, but the Analytics reporting API is not connected.",
    platformGodaddyUnconfigured: "Registrar records are not connected to this private status page.",
    platformSearchConsoleUnconfigured: "Search Console reporting access is not connected to this private status page.",
  });
  Object.assign(COPY.ar, {
    adminNavigation: "التنقل في الإدارة", adminSections: "أقسام الإدارة", siteHome: "الصفحة الرئيسية لـ Riddle Arabia", editorialWork: "العمل التحريري", accountMetrics: "إحصاءات الحسابات",
    editorialUnavailable: "البيانات التحريرية غير متاحة مؤقتًا. حدّث الصفحة للمحاولة مجددًا.", liveOverrides: "التعديلات المعروضة", browseContent: "تصفح المحتوى", categorySearch: "ابحث عن موضوع", categorySearchPlaceholder: "اسم الموضوع",
    allCategories: "كل المواضيع", clearFilters: "مسح المرشحات", pageSize: "في الصفحة",
    previousPage: "السابق", nextPage: "التالي", backToResults: "العودة إلى النتائج",
    editorLanguage: "لغة التحرير", english: "English", arabic: "العربية", compareLanguages: "مقارنة",
    previewLanguage: "لغة المعاينة", sources: "المصادر", sourcesHint: "أضف حتى ٨ مصادر. يحتاج كل مصدر إلى عنوان وناشر ورابط HTTPS فريد.",
    addSource: "إضافة مصدر", removeSource: "حذف المصدر {number}", sourceTitle: "العنوان", sourcePublisher: "الناشر", sourceUrl: "رابط HTTPS",
    saveState: "محفوظ", unsavedChanges: "تغييرات غير محفوظة", savingDraft: "جارٍ الحفظ…", savedWithChanges: "حُفظت النسخة؛ توجد تغييرات أحدث غير محفوظة.",
    discardChanges: "لديك تغييرات غير محفوظة. هل تريد تجاهلها والمتابعة؟",
    keepChanges: "لديك تغييرات غير محفوظة. هل تريد المتابعة مع الاحتفاظ بها في المحرر؟",
    saveBeforePublish: "احفظ تغييراتك أو تجاهلها قبل نشر النسخة المحفوظة.",
    publishedOverride: "المعروض: النسخة المنشورة {version}", staticLive: "المعروض: السؤال الأصلي",
    contentPublishedState: "النسخة المعروضة", draftStatus: "التحرير: {status}",
    pageSummary: "{from}–{to} من {count} سؤال", pageNumber: "الصفحة {page} من {pages}",
    noCategories: "لا توجد مواضيع مطابقة", invalidSources: "يحتاج كل مصدر إلى عنوان وناشر ورابط HTTPS فريد (بحد أقصى ٨).",
    recentEdits: "التعديلات الأخيرة", recentEditsHint: "تابع من حيث توقفت", noRecentEdits: "لا توجد تعديلات تحريرية بعد.",
    accountActivity: "نشاط الحسابات", draftCount: "المسودات", pendingReview: "بانتظار المراجعة", publishedOverrides: "التعديلات المنشورة",
    reviewDrafts: "مراجعة المسودات", feedbackQueue: "الأسئلة المبلغ عنها والملاحظات", editorialQueue: "جاهز للمراجعة",
    openQuestion: "فتح السؤال", returnToFeedback: "العودة إلى الملاحظات", resolutionNote: "ملاحظة المعالجة", saveNote: "حفظ الملاحظة",
    notePlaceholder: "اشرح التصحيح أو سبب القرار", noteRequired: "أضف ملاحظة معالجة قبل الحفظ.", noteSaved: "حُفظت ملاحظة المعالجة.",
    reportContext: "بلاغ عن سؤال", reportedWording: "النص المبلغ عنه", currentWording: "النص الحالي",
    reportMismatch: "يختلف النص المبلغ عنه عن السؤال الحالي. تحقق من معرّف السؤال قبل التصحيح.",
    reportMatches: "يطابق البلاغ السؤال الحالي (قد يكون نص البلاغ مختصرًا).",
    reportMissing: "لم يُعثر على هذا السؤال في الموضوع المبلغ عنه. يبقى البلاغ متاحًا للتحقق.",
    reportInvalid: "لا يتضمن البلاغ موضوعًا ومعرّف سؤال صالحين.",
    contentSearchFailed: "تعذر تحميل مكتبة الأسئلة كاملة. حدّث النتائج للمحاولة مجددًا.",
    allCaughtUp: "لا توجد ملاحظات أو مسودات بانتظار المراجعة.",
    platformStatus: "حالة المنصات", platformStatusHeading: "حالة المنصات",
    platformStatusLead: "عرض خاص موحّد لنشاط Riddle Arabia من المصدر الأول وفحوصات مزودي الخدمة المتصلين.",
    platformRefresh: "تحديث الحالة", platformSnapshot: "لقطة الحالة", platformChecking: "جارٍ فحص اتصالات المنصات…",
    platformStatusWaiting: "ستظهر تفاصيل الحالة عند جاهزية اللقطة الآمنة.",
    platformSnapshotUpdated: "تحديث اللقطة", platformDataScope: "نطاق البيانات", platformDataScopeValue: "قراءة فقط من الخادم",
    platformMetricsHeading: "استخدام Riddle Arabia", platformMetricsLead: "نشاط الحسابات واللعبة من المصدر الأول؛ وتقتصر بعض البيانات على ما تمت الموافقة عليه.",
    platformSourcesHeading: "مصادر المنصات", platformSourcesLead: "افتح لوحة المزود فقط عندما تحتاج البطاقة إلى تدقيق أقرب.",
    platformPrivacyNote: "لا تصل بيانات اعتماد المزود إلى هذا المتصفح. تُقرأ الحالات من لقطة للقراءة فقط على الخادم.",
    platformOverallHealthy: "تعمل Riddle Arabia بصورة طبيعية", platformOverallHealthyDetail: "اكتملت واجهة المالك ولقطة التجميع من المصدر الأول بنجاح.", platformOverallAttention: "تحتاج إحدى المنصات إلى انتباه", platformOverallAttentionDetail: "اكتملت لقطة التجميع، لكن مخطط الخدمة يحتاج إلى انتباه.", platformOverallUnavailable: "حالة المنصات غير متاحة", platformRefreshRetainedHeadline: "تعذر آخر تحديث", platformRefreshRetainedDetail: "تظهر آخر لقطة حالة ناجحة. حاول التحديث مرة أخرى.",
    platformStateHealthy: "تعمل", platformStatePartial: "بيانات جزئية", platformStateAttention: "تحتاج انتباهًا", platformStateManual: "فحص يدوي", platformStateUnconfigured: "غير متصلة", platformStateStale: "قديمة", platformStateUnknown: "غير معروفة", platformStateChecking: "جارٍ الفحص",
    platformUnavailable: "تعذر تحميل حالة المنصات. حاول مجددًا.", platformNoMetrics: "لا توجد مقاييس استخدام من المصدر الأول بعد.",
    platformNoSources: "لا تتوفر بطاقات مصادر للمزودين بعد.", platformNoFreshness: "لا يوجد وقت للقطة", platformObserved: "رُصدت في {date}",
    platformManualHeadline: "افتح لوحة المزود للتحقق من هذا المصدر", platformManualDetail: "يُفحص هذا الاتصال عمدًا في لوحة المزود؛ ولا تتلقى لوحة الإدارة بيانات اعتماد المزود.",
    platformNotConfiguredHeadline: "لم يتم ربط التقارير", platformNotConfiguredDetail: "يمكن إضافة اتصال تقارير للقراءة فقط لاحقًا. استخدم لوحة المزود مباشرةً حتى ذلك الحين.",
    platformOpenDashboard: "فتح اللوحة", platformMetricUnavailable: "—",
    platformRegisteredUsers: "المستخدمون المسجلون", platformRegisteredUsersDetail: "كل سجلات الحسابات",
    platformAdministrators: "المسؤولون", platformAdministratorsDetail: "حسابات المالك والمسؤول",
    platformActiveSessions: "الجلسات النشطة", platformActiveSessionsDetail: "مسجلون حاليًا",
    platformCompletedProgress: "الجولات المكتملة", platformCompletedProgressDetail: "تقدم اللعبة من المصدر الأول",
    platformPendingSuggestions: "ملاحظات جديدة", platformPendingSuggestionsDetail: "بانتظار المراجعة",
    platformSuspendedUsers: "حسابات مقيّدة", platformSuspendedUsersDetail: "وصول مقيّد",
    platformConsentedUsage: "استخدام بموافقة", platformConsentedUsageDetail: "دقائق لحسابات مسجلة وبموافقة",
    platformContentDrafts: "مسودات المحتوى", platformContentDraftsDetail: "مساحة التحرير",
    platformContentReview: "محتوى قيد المراجعة", platformContentReviewDetail: "مساحة التحرير",
    platformPublishedOverrides: "تعديلات معروضة", platformPublishedOverridesDetail: "تغييرات محتوى منشورة",
    platformCloudflareEdgeRequests: "طلبات الحافة", platformCloudflareEdgeRequestsDetail: "مستخدمون نهائيون · آخر 24 ساعة",
    platformCloudflareVisits: "زيارات Cloudflare", platformCloudflareVisitsDetail: "مباشرة أو إحالة · آخر 24 ساعة",
    platformCloudflareDataTransfer: "نقل البيانات", platformCloudflareDataTransferDetail: "استجابات الحافة · آخر 24 ساعة",
    platformCloudflareApiRequests: "طلبات عامل API", platformCloudflareApiRequestsDetail: "jakh-api · آخر 24 ساعة",
    platformCloudflareApiErrors: "أخطاء عامل API", platformCloudflareApiErrorsDetail: "أخطاء استدعاء العامل · آخر 24 ساعة",
    platformCloudflareSiteRequests: "طلبات عامل الموقع", platformCloudflareSiteRequestsDetail: "jakh-site · آخر 24 ساعة",
    platformCloudflareSiteErrors: "أخطاء عامل الموقع", platformCloudflareSiteErrorsDetail: "أخطاء استدعاء العامل · آخر 24 ساعة",
    platformCloudflareCategory: "الزيارات والبنية التحتية", platformGithubCategory: "النشر والمراقبة", platformGoogleAnalyticsCategory: "الجمهور والتفاعل", platformGodaddyCategory: "النطاق والمسجّل", platformSearchConsoleCategory: "ظهور البحث",
    platformCloudflareManual: "تتوفر هنا بيئة تشغيل واجهة Cloudflare API؛ وتظل تحليلات الزيارات والحافة فحصًا في لوحة المزود.",
    platformCloudflareUnconfigured: "لم يتم إعداد اتصال تحليلات Cloudflare المخصص للقراءة فقط بعد.",
    platformCloudflareLiveHeadline: "تحليلات Cloudflare حديثة", platformCloudflareLiveDetail: "تتوفر مجاميع الحافة والعمال لآخر 24 ساعة عبر الاتصال الآمن من الخادم.",
    platformCloudflarePartialHeadline: "تحليلات Cloudflare متاحة جزئيًا", platformCloudflarePartialDetail: "تظهر المجاميع الحالية، لكن مجموعة بيانات مطلوبة واحدة أو أكثر لم تُرجع نتائج. تظل القيم المعروضة صالحة.",
    platformCloudflareStaleHeadline: "تحتاج تحليلات Cloudflare إلى تحديث", platformCloudflareStaleDetail: "تُعرض آخر لقطة مجمعة ناجحة من Cloudflare أثناء تحديث المزود.", platformCloudflareStalePartialDetail: "تُعرض آخر لقطة جزئية ناجحة من Cloudflare أثناء تحديث المزود.",
    platformCloudflareUnavailableHeadline: "تحليلات Cloudflare غير متاحة مؤقتًا", platformCloudflareUnavailableDetail: "لم تُرجع Cloudflare لقطة مجمعة قابلة للاستخدام. قد يظل الموقع نفسه يعمل بصورة طبيعية.",
    platformGithubManual: "تظل إجراءات GitHub ومراقبة الإنتاج فحصًا في لوحة المزود.",
    platformGoogleAnalyticsUnconfigured: "تجميع البيانات بعد الموافقة موجود، لكن واجهة تقارير Analytics غير متصلة.",
    platformGodaddyUnconfigured: "سجلات المسجّل غير متصلة بصفحة الحالة الخاصة هذه.",
    platformSearchConsoleUnconfigured: "وصول تقارير Search Console غير متصل بصفحة الحالة الخاصة هذه.",
  });

  Object.assign(COPY.en, {
    autopilot: "Autopilot", autopilotLead: "Scheduled maintenance for generated search indexes and site pages.",
    autopilotStatus: "Schedule status", autopilotActive: "Active", autopilotPaused: "Paused", autopilotNotConnected: "Not connected", autopilotStatusError: "Status unavailable",
    autopilotActiveMessage: "Scheduled runs are enabled, subject to the schedule and daily limits below.",
    autopilotPausedMessage: "Scheduled runs are paused. A run already in progress may finish.",
    autopilotNotConnectedMessage: "The Autopilot service is not connected yet. Refresh after it becomes available.",
    autopilotLoadError: "Could not confirm Autopilot status. Refresh to try again.", autopilotUpdateError: "Could not confirm the change. Refresh the status before trying again.",
    autopilotResume: "Resume Autopilot", autopilotPause: "Pause Autopilot", autopilotUpdating: "Updating…",
    autopilotResumed: "Autopilot is active.", autopilotPausedToast: "Autopilot is paused.",
    autopilotPolicy: "Schedule and limits", autopilotSchedule: "Scheduled check", autopilotDailySchedule: "Daily at 07:23 Dubai time",
    autopilotRunLimit: "Runs per day", autopilotReleaseLimit: "Releases per day", autopilotAiBudget: "AI budget (USD)",
    autopilotNoAi: "No paid AI calls are allowed by this policy.", autopilotPolicyUnavailable: "Schedule and limits are unavailable until the service responds.",
    autopilotScope: "Automatic repair scope", autopilotScopeDescription: "Checks for routine problems and repairs generated search indexes and site pages. A release must pass its checks before deployment.",
    autopilotScopeLimits: "Question wording, accounts, and security settings require a separate review. Other findings appear in the run activity.",
    autopilotLastRun: "Last run", autopilotActivity: "Run activity", autopilotNoRuns: "No runs have been recorded yet.",
    autopilotActivityUnavailable: "Run activity is unavailable until the service responds.", autopilotRunLabel: "Run {id}", autopilotRunUnknown: "Recorded run",
    autopilotInspecting: "Checking", autopilotNoChanges: "No changes needed", autopilotFixing: "Applying repairs", autopilotTesting: "Running checks",
    autopilotReleaseReserved: "Release reserved", autopilotDeployed: "Deployed", autopilotFailed: "Failed", autopilotRolledBack: "Rolled back", autopilotNeedsAttention: "Needs attention",
    autopilotViewRun: "View GitHub run", autopilotViewDeployment: "View deployment run", autopilotFindings: "Findings", autopilotRepairs: "Repairs applied",
    autopilotChecksPassed: "Checks passed", autopilotChecksFailed: "Checks failed", autopilotFindingDetail: "Finding details",
    autopilotBrokenLinks: "Broken links", autopilotAccessibility: "Accessibility", autopilotPerformance: "Performance", autopilotDependencies: "Dependencies", autopilotContent: "Content",
    autopilotSourceCommit: "Source commit", autopilotCandidateCommit: "Candidate commit", autopilotBuild: "Deployed build", autopilotWorkerVersion: "Worker version",
  });
  Object.assign(COPY.ar, {
    autopilot: "التشغيل التلقائي", autopilotLead: "صيانة مجدولة لفهارس البحث وصفحات الموقع المولّدة.",
    autopilotStatus: "حالة الجدولة", autopilotActive: "نشط", autopilotPaused: "متوقف مؤقتًا", autopilotNotConnected: "غير متصل", autopilotStatusError: "الحالة غير متاحة",
    autopilotActiveMessage: "التشغيل المجدول مفعّل وفق المواعيد والحدود اليومية أدناه.",
    autopilotPausedMessage: "التشغيل المجدول متوقف مؤقتًا. قد تكتمل عملية بدأت بالفعل.",
    autopilotNotConnectedMessage: "خدمة التشغيل التلقائي غير متصلة بعد. حدّث الحالة عندما تصبح متاحة.",
    autopilotLoadError: "تعذر التحقق من حالة التشغيل التلقائي. حدّث الحالة للمحاولة مجددًا.", autopilotUpdateError: "تعذر تأكيد التغيير. حدّث الحالة قبل المحاولة مجددًا.",
    autopilotResume: "استئناف التشغيل التلقائي", autopilotPause: "إيقاف التشغيل التلقائي مؤقتًا", autopilotUpdating: "جارٍ التحديث…",
    autopilotResumed: "التشغيل التلقائي نشط الآن.", autopilotPausedToast: "توقف التشغيل التلقائي مؤقتًا.",
    autopilotPolicy: "المواعيد والحدود", autopilotSchedule: "موعد الفحص", autopilotDailySchedule: "يوميًا الساعة 07:23 بتوقيت دبي",
    autopilotRunLimit: "عمليات التشغيل يوميًا", autopilotReleaseLimit: "الإصدارات يوميًا", autopilotAiBudget: "ميزانية الذكاء الاصطناعي (دولار)",
    autopilotNoAi: "لا تسمح هذه السياسة بأي استدعاءات مدفوعة لخدمات الذكاء الاصطناعي.", autopilotPolicyUnavailable: "تتوفر المواعيد والحدود بعد استجابة الخدمة.",
    autopilotScope: "نطاق الإصلاح التلقائي", autopilotScopeDescription: "يفحص المشكلات المعتادة ويصلح فهارس البحث وصفحات الموقع المولّدة. يجب أن يجتاز الإصدار فحوصه قبل النشر.",
    autopilotScopeLimits: "تتطلب صياغة الأسئلة والحسابات وإعدادات الأمان مراجعة منفصلة. تظهر الملاحظات الأخرى في سجل التشغيل.",
    autopilotLastRun: "آخر تشغيل", autopilotActivity: "سجل التشغيل", autopilotNoRuns: "لم تُسجّل أي عمليات تشغيل بعد.",
    autopilotActivityUnavailable: "يتوفر سجل التشغيل بعد استجابة الخدمة.", autopilotRunLabel: "عملية التشغيل {id}", autopilotRunUnknown: "عملية تشغيل مسجّلة",
    autopilotInspecting: "جارٍ الفحص", autopilotNoChanges: "لا حاجة لتغييرات", autopilotFixing: "جارٍ الإصلاح", autopilotTesting: "جارٍ تنفيذ الفحوص",
    autopilotReleaseReserved: "حُجز الإصدار", autopilotDeployed: "نُشر", autopilotFailed: "فشل", autopilotRolledBack: "أُعيد الإصدار السابق", autopilotNeedsAttention: "يحتاج إلى متابعة",
    autopilotViewRun: "عرض التشغيل في GitHub", autopilotViewDeployment: "عرض عملية النشر", autopilotFindings: "الملاحظات", autopilotRepairs: "الإصلاحات المطبّقة",
    autopilotChecksPassed: "الفحوص الناجحة", autopilotChecksFailed: "الفحوص الفاشلة", autopilotFindingDetail: "تفاصيل الملاحظات",
    autopilotBrokenLinks: "روابط معطّلة", autopilotAccessibility: "إمكانية الوصول", autopilotPerformance: "الأداء", autopilotDependencies: "الاعتماديات", autopilotContent: "المحتوى",
    autopilotSourceCommit: "نسخة المصدر", autopilotCandidateCommit: "النسخة المرشحة", autopilotBuild: "البناء المنشور", autopilotWorkerVersion: "نسخة الخدمة",
  });

  const state = {
    lang: "en",
    me: null,
    overview: null,
    health: null,
    security: null,
    audit: null,
    autopilot: { data: null, phase: "idle", pending: false, errorKey: "", requestVersion: 0 },
    platform: { data: null, loading: false, error: null, loaded: false },
    activeTab: "overview",
    gateMode: "checking",
    people: { items: [], nextOffset: null, canViewEmail: false },
    feedback: { items: [], nextOffset: null, canViewEmail: false, drafts: new Map(), pending: new Set(), loadVersion: 0, mutationRevision: 0 },
    content: {
      catalog: null,
      cards: [],
      edits: new Map(),
      selectedId: null,
      category: "",
      revisions: [],
      cache: new Map(),
      loadVersion: 0,
      page: 0,
      loaded: false,
      loading: false,
      dirty: false,
      baseline: "",
      saving: false,
      editorLanguage: "en",
      previewLanguage: "en",
      report: null,
      lastQuestionButton: null,
      messageError: false,
      editorRevision: 0,
      lastSnapshot: "",
    },
    stepUpResolver: null,
    actionReview: null,
    actionReviewResolver: null,
  };

  const settingsMemory = new Map();
  function safeSettingsRead() {
    try {
      const raw = localStorage.getItem("jakh-riddles-settings");
      if (raw !== null) settingsMemory.set("jakh-riddles-settings", raw);
      return JSON.parse(raw || settingsMemory.get("jakh-riddles-settings") || "{}");
    } catch {
      try { return JSON.parse(settingsMemory.get("jakh-riddles-settings") || "{}"); } catch { return {}; }
    }
  }

  function safeSettingsWrite(value) {
    const raw = JSON.stringify(value);
    settingsMemory.set("jakh-riddles-settings", raw);
    try { localStorage.setItem("jakh-riddles-settings", raw); return true; } catch { return false; }
  }

  state.lang = initialLanguage();

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
      const saved = safeSettingsRead();
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

  function setConnection(kind, key) {
    els.connectionState.className = `connection-state ${kind}`;
    els.connectionState.dataset.i18n = key;
    els.connectionState.textContent = t(key);
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
    document.title = state.lang === "ar" ? "Riddle Arabia · الإدارة" : "Riddle Arabia · Administration";
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
    renderAutopilot();
    if (state.platform.data || state.platform.loading || state.platform.error) renderPlatformStatus();
    if (state.content.catalog) renderContentCategoryOptions();
    if (state.content.loaded) {
      renderContentQuestionList();
      if (state.content.selectedId) {
        renderContentSources(sourceValues());
        renderContentEditorChrome();
        renderContentPreview();
        updateContentDirty();
        renderContentReport();
      }
    }
    $(".editor-language-tabs")?.setAttribute("aria-label", t("editorLanguage"));
    $(".sidebar")?.setAttribute("aria-label", t("adminNavigation"));
    $(".brand")?.setAttribute("aria-label", t("siteHome"));
    els.adminTabs.setAttribute("aria-label", t("adminSections"));
    els.metricGrid.setAttribute("aria-label", t("editorialWork"));
    els.accountMetricGrid.setAttribute("aria-label", t("accountMetrics"));
    els.platformMetricGrid.setAttribute("aria-label", t("platformMetricsHeading"));
    els.platformSourceGrid.setAttribute("aria-label", t("platformSourcesHeading"));
    if (state.actionReview) renderActionReview();
  }

  function persistLanguage() {
    safeSettingsWrite({ lang: state.lang });
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
    const hasAccess = Boolean(state.me && ADMIN_ROLES.has(state.me.role));
    gate.hidden = hasAccess;
    els.refreshButton.hidden = !hasAccess;
    els.logoutButton.hidden = !hasAccess;
  }

  function showApp() {
    els.gate.hidden = true;
    els.adminApp.hidden = false;
    els.refreshButton.hidden = false;
    els.logoutButton.hidden = false;
  }

  function renderIdentity() {
    const user = state.me;
    els.identityName.textContent = user.username;
    els.identityRole.textContent = roleLabel(user.role).toUpperCase();
    els.identityAvatar.textContent = user.avatar || "👤";
    els.auditTab.hidden = user.role !== "OWNER";
    els.autopilotTab.hidden = user.role !== "OWNER";
    els.platformStatusTab.hidden = user.role !== "OWNER";
    els.sessionControlCard.hidden = user.role !== "OWNER";
    if (user.role !== "OWNER") els.platformStatusPanel.hidden = true;
  }

  function metric(label, value, note, action = "") {
    const tag = action ? "button" : "article";
    return `<${tag} class="metric-card" ${action ? `type="button" ${action}` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(numberFormat(value))}</strong><span class="metric-note">${escapeHtml(note)}</span></${tag}>`;
  }

  function activityItem(title, meta, badge = "") {
    return `<article class="activity-item"><div class="activity-main"><strong>${escapeHtml(title)}</strong><div class="activity-meta">${escapeHtml(meta)}</div></div>${badge}</article>`;
  }

  function renderOverview(data) {
    const metrics = data.metrics || {};
    els.accountMetricGrid.innerHTML = [
      metric(t("members"), metrics.users, t("allTime")),
      metric(t("privileged"), metrics.administrators, t("ownerAndAdmin")),
      metric(t("activeSessions"), metrics.activeSessions, t("liveNow")),
      metric(t("correctSolves"), metrics.solved, t("answeredCorrectly")),
      metric(t("newFeedback"), metrics.pendingSuggestions, t("awaitingReview")),
      metric(t("suspendedAccounts"), metrics.suspendedUsers, t("accessRestricted")),
    ].join("");
    const editorial = data.editorial || {};
    els.metricGrid.innerHTML = [
      metric(t("newFeedback"), metrics.pendingSuggestions, t("awaitingReview"), 'data-feedback-queue="new"'),
      metric(t("pendingReview"), editorial.inReview, t("editorialQueue"), 'data-content-queue="IN_REVIEW"'),
      metric(t("draftCount"), editorial.drafts, t("contentStudio"), 'data-content-queue="DRAFT"'),
      metric(t("publishedOverrides"), editorial.publishedOverrides, t("liveNow"), 'data-content-queue="LIVE"'),
    ].join("");
    els.recentEdits.innerHTML = data.recentEdits?.length ? data.recentEdits.map((edit) => `<article class="activity-item"><div class="activity-main"><strong dir="ltr">${escapeHtml(edit.questionId)}</strong><div class="activity-meta">${escapeHtml(contentStatusLabel(edit.workflowStatus))} · v${escapeHtml(edit.version)} · ${escapeHtml(edit.editorUsername || "—")} · ${escapeHtml(dateFormat(edit.updatedAt, true))}</div></div><button class="text-button" type="button" data-open-content-id="${escapeHtml(edit.questionId)}" data-open-content-category="${escapeHtml(edit.categorySlug)}">${escapeHtml(t("openQuestion"))}</button></article>`).join("") : `<div class="empty-state">${escapeHtml(t("noRecentEdits"))}</div>`;
    if (data.editorialAvailable === false) {
      els.metricGrid.innerHTML = `<div class="empty-state" role="status">${escapeHtml(t("editorialUnavailable"))}</div>`;
      els.recentEdits.innerHTML = `<div class="empty-state">${escapeHtml(t("editorialUnavailable"))}</div>`;
    }
    els.feedbackCount.hidden = !(metrics.pendingSuggestions > 0);
    els.feedbackCount.textContent = numberFormat(metrics.pendingSuggestions);
    els.lastUpdated.textContent = dateFormat(new Date().toISOString(), true);

    const queue = [];
    if (metrics.pendingSuggestions > 0) {
      queue.push(`<div class="queue-item"><div><strong>${escapeHtml(numberFormat(metrics.pendingSuggestions))}</strong><span>${escapeHtml(t("feedbackAwaiting"))}</span></div><button class="text-button" type="button" data-open-tab="feedback">${escapeHtml(t("reviewFeedback"))}</button></div>`);
    }
    if (editorial.inReview > 0) {
      queue.push(`<div class="queue-item"><div><strong>${escapeHtml(numberFormat(editorial.inReview))}</strong><span>${escapeHtml(t("pendingReview"))}</span></div><button class="text-button" type="button" data-content-queue="IN_REVIEW">${escapeHtml(t("reviewDrafts"))}</button></div>`);
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
      ? data.recentSuggestions.map((suggestion) => {
        const report = parseQuestionReport(suggestion.text);
        return activityItem(
          report ? report.wording : suggestion.text,
          `${report ? `${report.questionId} · ` : ""}${dateFormat(suggestion.createdAt)}`,
          `<div class="activity-actions"><span class="status-label">${escapeHtml(statusLabel(suggestion.status))}</span>${report ? `<button class="text-button" type="button" data-feedback-open-question="${escapeHtml(suggestion.id)}">${escapeHtml(t("openQuestion"))}</button>` : ""}</div>`,
        );
      }).join("")
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

  function platformEntries(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).map(([id, item]) => (
      item && typeof item === "object" && !Array.isArray(item) ? { ...item, id: item.id || id } : { id, value: item }
    ));
  }

  function platformText(value, fallback = "") {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
    const localized = value[state.lang] ?? value.en ?? value.ar;
    return typeof localized === "string" && localized.trim() ? localized.trim() : fallback;
  }

  function platformReadableId(value) {
    const text = String(value || "").replace(/[-_]+/gu, " ").trim();
    return text ? text.replace(/\b[a-z]/gu, (letter) => letter.toUpperCase()) : "—";
  }

  function platformState(value) {
    const raw = String(
      value && typeof value === "object" ? (value.state ?? value.status ?? "") : (value ?? ""),
    ).trim().toLowerCase().replace(/[\s-]+/gu, "_");
    if (raw.includes("not_configured") || raw.includes("not_connected") || raw === "disabled") return "unconfigured";
    if (raw.includes("manual")) return "manual";
    if (raw.includes("partial")) return "partial";
    if (raw.includes("stale")) return "stale";
    if (["healthy", "operational", "ok", "online", "ready", "active", "good"].includes(raw)) return "good";
    if (["degraded", "attention", "error", "failed", "failure", "down", "incident", "unhealthy", "critical", "unavailable"].includes(raw)) return "attention";
    if (["checking", "pending", "loading", "refreshing"].includes(raw)) return "checking";
    return "unknown";
  }

  function platformStateMeta(value) {
    return {
      good: { key: "platformStateHealthy", className: "good", pillClass: "is-good" },
      partial: { key: "platformStatePartial", className: "stale", pillClass: "is-pending" },
      attention: { key: "platformStateAttention", className: "attention", pillClass: "is-danger" },
      manual: { key: "platformStateManual", className: "manual", pillClass: "is-pending" },
      unconfigured: { key: "platformStateUnconfigured", className: "unconfigured", pillClass: "is-pending" },
      stale: { key: "platformStateStale", className: "stale", pillClass: "is-pending" },
      checking: { key: "platformStateChecking", className: "manual", pillClass: "is-pending" },
      unknown: { key: "platformStateUnknown", className: "unconfigured", pillClass: "is-pending" },
    }[value] || { key: "platformStateUnknown", className: "unconfigured", pillClass: "is-pending" };
  }

  function platformByteValue(value) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = Math.max(0, value);
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    const digits = amount >= 100 || Number.isInteger(amount) ? 0 : amount >= 10 ? 1 : 2;
    return `${new Intl.NumberFormat(state.lang === "ar" ? "ar" : undefined, { maximumFractionDigits: digits }).format(amount)} ${units[index]}`;
  }

  function platformMetricValue(metric) {
    const value = metric?.value;
    if (value === null || value === undefined || value === "") return t("platformMetricUnavailable");
    if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
    const unit = typeof metric.unit === "string" ? metric.unit.trim() : "";
    if (metric.format === "bytes") return platformByteValue(value);
    if (unit === "%" || metric.format === "percent") {
      const percentage = Math.abs(value) <= 1 ? value * 100 : value;
      const digits = Number.isInteger(percentage) ? 0 : 1;
      return `${new Intl.NumberFormat(state.lang === "ar" ? "ar" : undefined, { maximumFractionDigits: digits }).format(percentage)}%`;
    }
    return `${numberFormat(value)}${unit ? ` ${unit}` : ""}`;
  }

  function platformMetricCopy(metric) {
    const known = PLATFORM_METRIC_COPY[String(metric?.id || "")];
    return {
      label: known ? t(known[0]) : platformText(metric?.label, platformReadableId(metric?.id)),
      detail: platformText(metric?.detail, known ? t(known[1]) : ""),
    };
  }

  function safePlatformLink(value) {
    const raw = typeof value === "string" ? value : (value?.url || value?.href || "");
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function platformFreshness(value) {
    if (!value || Number.isNaN(Date.parse(value))) return t("platformNoFreshness");
    return t("platformObserved", { date: dateFormat(value, true) });
  }

  function platformSourceView(source) {
    const id = String(source?.id || "").trim().toLowerCase();
    const known = PLATFORM_SOURCE_COPY[id];
    const stateName = platformState(source);
    const partialCoverage = source?.coverage === "partial";
    const meta = platformStateMeta(stateName);
    const label = known?.label || platformText(source?.label, platformReadableId(id));
    const category = known?.category ? t(known.category) : platformText(source?.category, t("platformSourcesHeading"));
    let headline = platformText(source?.headline, t(meta.key));
    let detail = platformText(source?.detail, "");
    if (stateName === "manual") {
      headline = t("platformManualHeadline");
      detail = known?.manualDetail ? t(known.manualDetail) : t("platformManualDetail");
    } else if (stateName === "unconfigured") {
      headline = t("platformNotConfiguredHeadline");
      detail = known?.unconfiguredDetail ? t(known.unconfiguredDetail) : t("platformNotConfiguredDetail");
    } else if (id === "cloudflare" && stateName === "good") {
      headline = t("platformCloudflareLiveHeadline");
      detail = t("platformCloudflareLiveDetail");
    } else if (id === "cloudflare" && stateName === "partial") {
      headline = t("platformCloudflarePartialHeadline");
      detail = t("platformCloudflarePartialDetail");
    } else if (id === "cloudflare" && stateName === "stale") {
      headline = t("platformCloudflareStaleHeadline");
      detail = t(partialCoverage ? "platformCloudflareStalePartialDetail" : "platformCloudflareStaleDetail");
    } else if (id === "cloudflare" && stateName === "attention") {
      headline = t("platformCloudflareUnavailableHeadline");
      detail = t("platformCloudflareUnavailableDetail");
    }
    const href = safePlatformLink(source?.link) || known?.url || "";
    const actionLabel = (stateName === "manual" || stateName === "unconfigured")
      ? t("platformOpenDashboard")
      : platformText(source?.actionLabel, platformText(source?.link?.label, t("platformOpenDashboard")));
    return { id, stateName, meta, label, category, headline, detail, href, actionLabel };
  }

  function renderPlatformMetricCards(metrics) {
    if (!metrics.length) {
      els.platformMetricGrid.innerHTML = `<div class="empty-state">${escapeHtml(t("platformNoMetrics"))}</div>`;
      return;
    }
    els.platformMetricGrid.innerHTML = metrics.map((metric) => {
      const copy = platformMetricCopy(metric);
      return `<article class="metric-card"><span>${escapeHtml(copy.label)}</span><strong>${escapeHtml(platformMetricValue(metric))}</strong>${copy.detail ? `<span class="metric-note">${escapeHtml(copy.detail)}</span>` : ""}</article>`;
    }).join("");
  }

  function renderPlatformSourceCard(source) {
    const view = platformSourceView(source);
    const metrics = platformEntries(source?.metrics);
    const sourceMetrics = metrics.length ? `<div class="platform-source-metrics">${metrics.map((metric) => {
      const copy = platformMetricCopy(metric);
      return `<div class="platform-source-metric"><span>${escapeHtml(copy.label)}</span><strong>${escapeHtml(platformMetricValue(metric))}</strong>${copy.detail ? `<small>${escapeHtml(copy.detail)}</small>` : ""}</div>`;
    }).join("")}</div>` : "";
    const observedAt = source?.observedAt;
    const freshness = platformFreshness(observedAt);
    const link = view.href ? `<a class="platform-source-link" href="${escapeHtml(view.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(view.actionLabel)} <span aria-hidden="true">↗</span></a>` : "";
    return `<article class="platform-source-card" data-state="${view.meta.className}">
      <div class="platform-source-top">
        <div><span class="platform-source-category">${escapeHtml(view.category)}</span><h3>${escapeHtml(view.label)}</h3></div>
        <span class="platform-status is-${view.meta.className}">${escapeHtml(t(view.meta.key))}</span>
      </div>
      <div class="platform-source-main"><p class="platform-source-headline" dir="auto">${escapeHtml(view.headline)}</p>${view.detail ? `<p class="platform-source-detail" dir="auto">${escapeHtml(view.detail)}</p>` : ""}${sourceMetrics}</div>
      <div class="platform-source-footer"><span class="platform-observed">${escapeHtml(freshness)}</span>${link}</div>
    </article>`;
  }

  function setPlatformSnapshotTime(value) {
    if (!value || Number.isNaN(Date.parse(value))) {
      els.platformUpdatedAt.textContent = t("platformNoFreshness");
      els.platformUpdatedAt.removeAttribute("datetime");
      return;
    }
    els.platformUpdatedAt.textContent = dateFormat(value, true);
    els.platformUpdatedAt.setAttribute("datetime", value);
  }

  function setPlatformRefreshBusy(busy) {
    els.platformRefreshButton.disabled = busy;
    if (busy) els.platformRefreshButton.setAttribute("aria-busy", "true");
    else els.platformRefreshButton.removeAttribute("aria-busy");
  }

  function renderPlatformStatus() {
    const platform = state.platform;
    setPlatformRefreshBusy(platform.loading);
    if (platform.loading) {
      els.platformOverallPill.className = "status-pill is-pending";
      els.platformOverallPill.textContent = t("platformStateChecking");
      els.platformOverviewTitle.textContent = t("platformChecking");
      els.platformOverallDetail.textContent = t("platformStatusWaiting");
      setPlatformSnapshotTime(null);
      els.platformMetricGrid.innerHTML = `<div class="loading-state">${escapeHtml(t("loading"))}</div>`;
      els.platformSourceGrid.innerHTML = `<div class="loading-state">${escapeHtml(t("loading"))}</div>`;
      return;
    }
    if (!platform.data) {
      els.platformOverallPill.className = "status-pill is-danger";
      els.platformOverallPill.textContent = t("platformStateAttention");
      els.platformOverviewTitle.textContent = t("platformOverallUnavailable");
      els.platformOverallDetail.textContent = platform.error ? t("platformUnavailable") : t("platformStatusWaiting");
      setPlatformSnapshotTime(null);
      const message = platform.error ? t("platformUnavailable") : t("platformNoMetrics");
      els.platformMetricGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
      els.platformSourceGrid.innerHTML = `<div class="empty-state">${escapeHtml(platform.error ? t("platformUnavailable") : t("platformNoSources"))}</div>`;
      return;
    }

    const overall = platform.data.overall && typeof platform.data.overall === "object" ? platform.data.overall : {};
    // Preserve the last good snapshot after a failed manual refresh, but make
    // that condition explicit instead of leaving an old success presentation.
    const refreshFailed = Boolean(platform.error);
    const stateName = refreshFailed ? "attention" : platformState(overall);
    const meta = platformStateMeta(stateName);
    const fallbackHeadline = stateName === "good" ? t("platformOverallHealthy") : stateName === "attention" ? t("platformOverallAttention") : t(meta.key);
    els.platformOverallPill.className = `status-pill ${meta.pillClass}`;
    els.platformOverallPill.textContent = t(meta.key);
    els.platformOverviewTitle.textContent = refreshFailed ? t("platformRefreshRetainedHeadline") : stateName === "good" ? t("platformOverallHealthy") : stateName === "attention" ? t("platformOverallAttention") : platformText(overall.headline, fallbackHeadline);
    els.platformOverallDetail.textContent = refreshFailed ? t("platformRefreshRetainedDetail") : stateName === "good"
      ? t("platformOverallHealthyDetail")
      : stateName === "attention" ? t("platformOverallAttentionDetail") : platformText(overall.detail, "");
    setPlatformSnapshotTime(platform.data.updatedAt);

    renderPlatformMetricCards(platformEntries(platform.data.metrics));
    const sources = platformEntries(platform.data.sources);
    els.platformSourceGrid.innerHTML = (sources.length ? sources : PLATFORM_SOURCE_FALLBACKS).map(renderPlatformSourceCard).join("");
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

  function parseQuestionReport(text) {
    const match = /^\[REPORT\]\s+([a-z0-9][a-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9_-]*):\s*([\s\S]*)$/u.exec(String(text || ""));
    return match ? { categorySlug: match[1], questionId: match[2], wording: match[3] } : null;
  }

  function feedbackActionMarkup(suggestion) {
    const options = FEEDBACK_STATES.map((status) => (
      `<option value="${status}" ${suggestion.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`
    )).join("");
    const report = parseQuestionReport(suggestion.text);
    return `<div class="feedback-action">${report ? `<button class="secondary-button" type="button" data-feedback-open-question="${escapeHtml(suggestion.id)}">${escapeHtml(t("openQuestion"))}</button>` : ""}<label>${escapeHtml(t("reviewState"))}<select class="compact-select" data-feedback-status="${escapeHtml(suggestion.id)}" data-feedback-current="${escapeHtml(suggestion.status)}" ${state.feedback.pending.has(suggestion.id) ? 'disabled aria-busy="true"' : ""}>${options}</select></label></div>`;
  }

  function renderFeedback() {
    const suggestions = state.feedback.items;
    els.feedbackResults.innerHTML = suggestions.length
      ? suggestions.map((suggestion) => {
        const contact = state.feedback.canViewEmail ? (suggestion.email || t("noEmail")) : t("contactHidden");
        const note = suggestion.resolutionNote;
        return `<article class="feedback-card" data-feedback-id="${escapeHtml(suggestion.id)}"><div class="feedback-copy"><p dir="auto">${escapeHtml(suggestion.text)}</p><div class="feedback-meta">${escapeHtml(contact)} · ${escapeHtml(dateFormat(suggestion.createdAt))}</div>
          ${note ? `<div class="resolution-note"><strong>${escapeHtml(t("resolutionNote"))}</strong><p dir="auto">${escapeHtml(note.text)}</p><span>${escapeHtml(note.authorUsername || "—")} · ${escapeHtml(dateFormat(note.createdAt, true))}</span></div>` : ""}
          <div class="feedback-resolution"><label class="input-label"><span>${escapeHtml(t("resolutionNote"))}</span><textarea rows="2" maxlength="280" dir="auto" data-feedback-resolution="${escapeHtml(suggestion.id)}" placeholder="${escapeHtml(t("notePlaceholder"))}">${escapeHtml(state.feedback.drafts.get(suggestion.id) || "")}</textarea></label><button class="quiet-button" type="button" data-feedback-save-note="${escapeHtml(suggestion.id)}" ${state.feedback.pending.has(suggestion.id) ? 'disabled aria-busy="true"' : ""}>${escapeHtml(t("saveNote"))}</button></div>
        </div>${feedbackActionMarkup(suggestion)}</article>`;
      }).join("")
      : `<div class="empty-state">${escapeHtml(t("noMatchingFeedback"))}</div>`;
    els.loadMoreFeedback.hidden = state.feedback.nextOffset === null;
  }

  function feedbackDraftValue(id) {
    return state.feedback.drafts.get(id) || "";
  }

  function normalizeFeedbackNote(value) {
    return value.replace(/[\r\n]+/gu, " ").replace(/\s{2,}/gu, " ").trim().slice(0, ACTION_REASON_MAX_LENGTH);
  }

  function feedbackNoteValue(id) {
    return normalizeFeedbackNote(feedbackDraftValue(id));
  }

  function setFeedbackPending(id, pending) {
    if (pending) state.feedback.pending.add(id);
    else state.feedback.pending.delete(id);
    els.feedbackResults.querySelectorAll("[data-feedback-status], [data-feedback-save-note]").forEach((control) => {
      if ((control.dataset.feedbackStatus || control.dataset.feedbackSaveNote) !== id) return;
      control.disabled = pending;
      if (pending) control.setAttribute("aria-busy", "true");
      else control.removeAttribute("aria-busy");
    });
  }

  function clearSubmittedFeedbackDraft(id, submittedDraft, submittedReason) {
    if (feedbackDraftValue(id) === submittedDraft && normalizeFeedbackNote(submittedDraft) === submittedReason) {
      state.feedback.drafts.delete(id);
    }
  }

  async function refreshFeedbackAfterMutation() {
    const requests = [loadFeedback(true), loadOverview()];
    if (state.audit) requests.push(loadAudit());
    const results = await Promise.allSettled(requests);
    results.forEach((result) => { if (result.status === "rejected") handleActionError(result.reason); });
    renderFeedback();
  }

  async function saveFeedbackNote(button) {
    const id = button.dataset.feedbackSaveNote;
    const suggestion = state.feedback.items.find((item) => item.id === id);
    const submittedDraft = feedbackDraftValue(id);
    const reason = normalizeFeedbackNote(submittedDraft);
    if (!suggestion || state.feedback.pending.has(id)) return;
    if (!reason) { showToast(t("noteRequired"), true); return; }
    setFeedbackPending(id, true);
    try {
      await api(`/admin/suggestions/${encodeURIComponent(id)}`, { method: "PATCH", body: mutationPayload({ status: suggestion.status }, reason) });
      state.feedback.mutationRevision += 1;
      clearSubmittedFeedbackDraft(id, submittedDraft, reason);
      await refreshFeedbackAfterMutation();
      showToast(t("noteSaved"));
    } catch (error) { handleActionError(error); }
    finally { setFeedbackPending(id, false); }
  }

  function renderContentReport() {
    const report = state.content.report;
    els.contentReportContext.hidden = !report;
    if (!report) return;
    const card = state.content.cards.find((item) => item.id === report.questionId && item.categorySlug === report.categorySlug);
    const snapshot = card ? activeContentSnapshot(card) : null;
    const question = snapshot?.question || {};
    const wording = report.wording.trim();
    const matches = wording && [question.en, question.ar].some((text) => String(text || "").trim().startsWith(wording));
    els.contentReportContext.innerHTML = `<div class="panel-heading compact-heading"><strong>${escapeHtml(t("reportContext"))}</strong><button class="text-button" type="button" data-return-feedback>${escapeHtml(t("returnToFeedback"))}</button></div>
      <p><bdi>${escapeHtml(report.categorySlug)}/${escapeHtml(report.questionId)}</bdi></p>
      <p class="report-status" role="status">${escapeHtml(t(!card ? "reportMissing" : matches ? "reportMatches" : "reportMismatch"))}</p>
      <div class="report-comparison"><div><strong>${escapeHtml(t("reportedWording"))}</strong><p dir="auto">${escapeHtml(report.wording || "—")}</p></div>${card ? `<div><strong>${escapeHtml(t("currentWording"))}</strong><p lang="en" dir="ltr">${escapeHtml(question.en || "—")}</p><p lang="ar" dir="rtl">${escapeHtml(question.ar || "—")}</p></div>` : ""}</div>`;
  }

  async function openContentReference(categorySlug, questionId, report = null) {
    if (!confirmContentLeave()) return;
    if (!selectTab("content", false, true)) return;
    if (!state.content.loaded) await loadContentCategory({ authorized: true });
    const card = state.content.cards.find((item) => item.id === questionId && item.categorySlug === categorySlug);
    state.content.report = report;
    if (!card) {
      state.content.editorRevision += 1;
      state.content.selectedId = null;
      state.content.dirty = false;
      els.contentEditorForm.hidden = true;
      els.contentEditorEmpty.hidden = true;
      els.contentWorkspace.classList.add("is-editing");
      renderContentReport();
      if (!report) showToast(t("reportMissing"), true);
      els.contentReportContext.querySelector("[data-return-feedback]")?.focus();
      return;
    }
    selectContentQuestion(questionId, { force: true });
  }

  async function openFeedbackQuestion(id) {
    const suggestion = state.feedback.items.find((item) => item.id === id) || state.overview?.recentSuggestions?.find((item) => item.id === id);
    const report = parseQuestionReport(suggestion?.text);
    if (!report) { showToast(t("reportInvalid"), true); return; }
    await openContentReference(report.categorySlug, report.questionId, { ...report, suggestionId: id });
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
    return t(labels[event.action] || (String(event.action || "").startsWith("content.") ? "auditContent" : "auditGeneric"));
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

  function contentStatusLabel(status) {
    return t({
      UNEDITED: "unedited",
      DRAFT: "draft",
      IN_REVIEW: "inReview",
      PUBLISHED: "published",
      LIVE: "liveOverrides",
    }[status] || "unedited");
  }

  async function staticJson(path) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new AdminApiError(t("requestFailed"), response.status, "STATIC_CONTENT_UNAVAILABLE");
    return response.json();
  }

  function categoryTitle(slug) {
    const category = state.content.catalog?.categories?.find((item) => item.slug === slug);
    return category?.title?.[state.lang] || category?.title?.en || slug;
  }

  function renderContentCategoryOptions() {
    if (!state.content.catalog) return;
    const selected = state.content.category;
    const search = (els.contentCategorySearch?.value || "").trim().toLocaleLowerCase();
    const categories = [...(state.content.catalog.categories || [])]
      .filter((category) => category.slug === selected || !search || [category.slug, category.title?.en, category.title?.ar].join(" ").toLocaleLowerCase().includes(search))
      .sort((a, b) => categoryTitle(a.slug).localeCompare(categoryTitle(b.slug), state.lang));
    els.contentCategory.innerHTML = `<option value="">${escapeHtml(t("allCategories"))}</option>${categories.map((category) => (
      `<option value="${escapeHtml(category.slug)}" ${category.slug === selected ? "selected" : ""}>${escapeHtml(categoryTitle(category.slug))} · ${escapeHtml(numberFormat(category.count))}</option>`
    )).join("")}`;
    els.contentCategory.value = selected;
  }

  async function loadContentCatalog() {
    if (!state.content.catalog) state.content.catalog = await staticJson("/data/catalog.json");
    renderContentCategoryOptions();
  }

  async function loadAllContentEdits(category = "") {
    const edits = [];
    let offset = 0;
    do {
      const params = new URLSearchParams({ limit: "100", offset: String(offset) });
      if (category) params.set("category", category);
      const data = await api(`/admin/content?${params}`);
      edits.push(...(data.edits || []));
      const next = Number.isInteger(data.nextOffset) ? data.nextOffset : -1;
      if (next >= 0 && next <= offset) throw new AdminApiError(t("contentSearchFailed"));
      offset = next;
    } while (offset >= 0);
    return edits;
  }

  async function loadStaticCategories(categories, refresh = false) {
    // Four workers bound network concurrency; cached categories are reused by filters and search.
    const results = new Array(categories.length);
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, categories.length) }, async () => {
      while (index < categories.length) {
        const position = index++;
        const slug = categories[position].slug;
        if (refresh) state.content.cache.delete(slug);
        let cards = state.content.cache.get(slug);
        if (!cards) {
          cards = await staticJson(`/data/${encodeURIComponent(slug)}.json`);
          if (!Array.isArray(cards)) throw new AdminApiError(t("contentSearchFailed"));
          cards = cards.map((card) => ({ ...card, categorySlug: slug }));
          state.content.cache.set(slug, cards);
        }
        results[position] = cards;
      }
    }));
    return results.flat();
  }

  function activeContentSnapshot(card) {
    const edit = state.content.edits.get(card.id);
    return edit?.draft || {
      question: card.question || { en: "", ar: "" },
      answer: card.answer || { en: "", ar: "" },
      explanation: card.explanation || { en: "", ar: "" },
      sources: card.review?.sources || [],
    };
  }

  function filteredContentCards() {
    const search = els.contentSearch.value.trim().toLocaleLowerCase();
    const status = els.contentStatus.value;
    return state.content.cards.filter((card) => {
      const edit = state.content.edits.get(card.id);
      if (state.content.category && card.categorySlug !== state.content.category) return false;
      if (status === "LIVE" ? !edit?.hasPublishedVersion : status && (edit?.workflowStatus || "UNEDITED") !== status) return false;
      if (!search) return true;
      const snapshot = activeContentSnapshot(card);
      return [card.id, snapshot.question?.en, snapshot.question?.ar, snapshot.answer?.en, snapshot.answer?.ar,
        card.question?.en, card.question?.ar, card.answer?.en, card.answer?.ar]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(search);
    });
  }

  function renderContentFilters() {
    const filters = [];
    if (state.content.category) filters.push(categoryTitle(state.content.category));
    if (els.contentSearch.value.trim()) filters.push(els.contentSearch.value.trim());
    if (els.contentStatus.value) filters.push(contentStatusLabel(els.contentStatus.value));
    els.contentActiveFilters.innerHTML = filters.map((label) => `<span class="filter-chip">${escapeHtml(label)}</span>`).join("");
    els.contentClearFilters.hidden = !filters.length && !els.contentCategorySearch.value;
  }

  function renderContentQuestionList() {
    renderContentFilters();
    const cards = filteredContentCards();
    const pageSize = Number(els.contentPageSize.value) === 50 ? 50 : 30;
    const pages = Math.max(1, Math.ceil(cards.length / pageSize));
    state.content.page = Math.min(state.content.page, pages - 1);
    const start = state.content.page * pageSize;
    els.contentResultsSummary.textContent = state.content.loading ? t("loading") : cards.length
      ? t("pageSummary", { from: numberFormat(start + 1), to: numberFormat(Math.min(start + pageSize, cards.length)), count: numberFormat(cards.length) })
      : t("noMatchingQuestions");
    els.contentPageInfo.textContent = t("pageNumber", { page: numberFormat(state.content.page + 1), pages: numberFormat(pages) });
    els.contentPreviousPage.disabled = state.content.page === 0;
    els.contentNextPage.disabled = state.content.page >= pages - 1;
    els.contentQuestionList.setAttribute("aria-busy", String(state.content.loading));
    els.contentQuestionList.innerHTML = cards.length ? cards.slice(start, start + pageSize).map((card) => {
      const edit = state.content.edits.get(card.id);
      const snapshot = activeContentSnapshot(card);
      const active = state.content.selectedId === card.id;
      return `<button class="content-question-item${active ? " is-active" : ""}" type="button" data-content-question="${escapeHtml(card.id)}" ${active ? 'aria-current="true"' : ""}>
        <strong>${escapeHtml(card.id)}</strong><span class="content-question-category">${escapeHtml(categoryTitle(card.categorySlug))}</span>
        <p dir="auto">${escapeHtml(snapshot.question?.[state.lang] || snapshot.question?.en || "—")}</p>
        <span class="content-question-meta"><span>${escapeHtml(contentStatusLabel(edit?.workflowStatus || "UNEDITED"))}</span><span>v${escapeHtml(edit?.version || 0)}</span></span>
      </button>`;
    }).join("") : `<div class="${state.content.loading ? "loading-state" : "empty-state"}">${escapeHtml(t(state.content.loading ? "loading" : "noMatchingQuestions"))}</div>`;
  }

  function sourceValues() {
    return [...els.contentSourceList.querySelectorAll(".content-source-row")].map((row) => Object.fromEntries(
      ["title", "publisher", "url"].map((field) => [field, row.querySelector(`[data-source-field="${field}"]`).value]),
    ));
  }

  function renderContentSources(sources = []) {
    els.contentSourceList.innerHTML = sources.map((source, index) => `<div class="content-source-row">
      <div class="source-fields">${["title", "publisher", "url"].map((field) => `<label class="input-label"><span>${escapeHtml(t({ title: "sourceTitle", publisher: "sourcePublisher", url: "sourceUrl" }[field]))}</span><input type="${field === "url" ? "url" : "text"}" data-source-field="${field}" value="${escapeHtml(source[field] || "")}" maxlength="4000" ${field === "url" ? 'dir="ltr" placeholder="https://…"' : 'dir="auto"'}></label>`).join("")}</div>
      <button class="quiet-button" type="button" data-source-remove="${index}" aria-label="${escapeHtml(t("removeSource", { number: numberFormat(index + 1) }))}">${escapeHtml(t("removeSource", { number: numberFormat(index + 1) }))}</button>
    </div>`).join("");
    els.contentAddSource.disabled = sources.length >= 8;
  }

  function parseContentSources() {
    const sources = sourceValues();
    const rows = [...els.contentSourceList.querySelectorAll(".content-source-row")];
    rows.forEach((row) => row.querySelectorAll("input").forEach((input) => input.removeAttribute("aria-invalid")));
    if (sources.length > 8) throw new Error(t("invalidSources"));
    const seen = new Set();
    return sources.map((source, index) => {
      const title = source.title.trim();
      const publisher = source.publisher.trim();
      let url;
      try { url = new URL(source.url.trim()); } catch { /* Validated with the other fields below. */ }
      const invalid = !title ? "title" : !publisher ? "publisher" : !url || url.protocol !== "https:" || seen.has(url.href) ? "url" : "";
      if (invalid) {
        const input = rows[index].querySelector(`[data-source-field="${invalid}"]`);
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", "contentEditorMessage");
        input.focus();
        throw new Error(t("invalidSources"));
      }
      seen.add(url.href);
      return { title, publisher, url: url.href };
    });
  }

  function rawEditorSnapshot() {
    return JSON.stringify({
      question: { en: els.contentQuestionEn.value, ar: els.contentQuestionAr.value },
      answer: { en: els.contentAnswerEn.value, ar: els.contentAnswerAr.value },
      explanation: { en: els.contentExplanationEn.value, ar: els.contentExplanationAr.value },
      sources: sourceValues(),
    });
  }

  function contentEditorSnapshot() {
    const snapshot = JSON.parse(rawEditorSnapshot());
    ["question", "answer", "explanation"].forEach((field) => {
      ["en", "ar"].forEach((lang) => { snapshot[field][lang] = snapshot[field][lang].trim(); });
    });
    snapshot.sources = parseContentSources();
    if (!snapshot.question.en || !snapshot.question.ar || !snapshot.answer.en || !snapshot.answer.ar) throw new Error(t("contentRequired"));
    return snapshot;
  }

  function updateContentDirty() {
    const snapshot = rawEditorSnapshot();
    if (snapshot !== state.content.lastSnapshot) {
      state.content.editorRevision += 1;
      state.content.lastSnapshot = snapshot;
    }
    state.content.dirty = Boolean(state.content.selectedId && snapshot !== state.content.baseline);
    els.contentSaveState.textContent = t(state.content.saving ? "savingDraft" : state.content.dirty ? "unsavedChanges" : "saveState");
    els.contentSaveState.classList.toggle("is-unsaved", state.content.dirty);
    renderContentEditorChrome();
  }

  function hasUnsavedWork() {
    return state.content.dirty || state.feedback.drafts.size > 0;
  }

  function confirmWorkspaceLeave() {
    return !hasUnsavedWork() || window.confirm(t("discardChanges"));
  }

  function confirmContentLeave(discard = true) {
    return !state.content.dirty || window.confirm(t(discard ? "discardChanges" : "keepChanges"));
  }

  function setEditorLanguage(language, moveFocus = false) {
    if (!["en", "ar", "compare"].includes(language)) return;
    state.content.editorLanguage = language;
    $$('[data-editor-language]').forEach((button) => {
      const active = button.dataset.editorLanguage === language;
      button.setAttribute("aria-pressed", String(active));
      button.tabIndex = 0;
      if (active && moveFocus) button.focus();
    });
    $$('[data-editor-panel]').forEach((panel) => { panel.hidden = language !== "compare" && panel.dataset.editorPanel !== language; });
    els.contentEditorForm.classList.toggle("is-comparing", language === "compare");
    $(".content-language-grid").dataset.mode = language;
  }

  function renderContentPreview() {
    if (!state.content.selectedId) return;
    const lang = state.content.previewLanguage;
    const suffix = lang === "ar" ? "Ar" : "En";
    const question = els[`contentQuestion${suffix}`].value.trim() || "—";
    const answer = els[`contentAnswer${suffix}`].value.trim() || "—";
    const explanation = els[`contentExplanation${suffix}`].value.trim();
    els.contentPreviewCard.innerHTML = `<article class="content-preview-card" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
      <p class="preview-question">${escapeHtml(question)}</p>
      <p class="preview-answer"><strong>${escapeHtml(COPY[lang].answer)}:</strong> ${escapeHtml(answer)}</p>
      ${explanation ? `<p class="preview-explanation"><strong>${escapeHtml(COPY[lang].explanation)}:</strong> ${escapeHtml(explanation)}</p>` : ""}
    </article>`;
  }

  function renderContentEditorChrome() {
    const id = state.content.selectedId;
    if (!id) return;
    const edit = state.content.edits.get(id);
    const status = edit?.workflowStatus || "UNEDITED";
    const selfAuthored = Boolean(edit?.editorUserId && edit.editorUserId === state.me?.id);
    const publishBlocked = selfAuthored && state.me?.role !== "OWNER";
    els.contentEditorStatus.className = `status-pill ${status === "PUBLISHED" ? "is-good" : "is-pending"}`;
    els.contentEditorStatus.textContent = t("draftStatus", { status: contentStatusLabel(status) });
    els.contentPublishedState.textContent = edit?.hasPublishedVersion
      ? t("publishedOverride", { version: edit.publishedVersion || "—" }) : t("staticLive");
    els.contentEditorTitle.textContent = `${id}${edit ? ` · v${edit.version}` : ""}`;
    els.contentPublish.hidden = status !== "IN_REVIEW";
    els.contentPublish.disabled = publishBlocked || state.content.dirty || state.content.saving;
    els.contentUnpublish.hidden = !edit?.hasPublishedVersion;
    els.contentUnpublish.disabled = state.content.dirty || state.content.saving;
    els.contentSaveDraft.disabled = state.content.saving;
    els.contentSubmitReview.disabled = state.content.saving;
    els.contentHistoryButton.hidden = !edit;
    if (status === "IN_REVIEW" && selfAuthored && !state.content.messageError) {
      els.contentEditorMessage.textContent = t(publishBlocked ? "independentReviewRequired" : "ownerOverrideReview");
      els.contentEditorMessage.hidden = false;
    }
  }

  function fillContentEditor(card) {
    const snapshot = activeContentSnapshot(card);
    ["Question", "Answer", "Explanation"].forEach((field) => {
      ["En", "Ar"].forEach((lang) => { els[`content${field}${lang}`].value = snapshot[field.toLowerCase()]?.[lang.toLowerCase()] || ""; });
    });
    renderContentSources(snapshot.sources || []);
    state.content.baseline = rawEditorSnapshot();
    state.content.dirty = false;
    state.content.messageError = false;
    els.contentEditorMessage.hidden = true;
    els.contentHistory.hidden = true;
    setEditorLanguage(state.content.editorLanguage);
    updateContentDirty();
    renderContentPreview();
  }

  function selectContentQuestion(questionId, { force = false, focus = true } = {}) {
    const card = state.content.cards.find((candidate) => candidate.id === questionId);
    if (!card) return false;
    if (!force && questionId !== state.content.selectedId && !confirmContentLeave()) return false;
    const changed = questionId !== state.content.selectedId;
    if (changed) state.content.editorRevision += 1;
    state.content.selectedId = questionId;
    els.contentEditorEmpty.hidden = true;
    els.contentEditorForm.hidden = false;
    els.contentWorkspace.classList.add("is-editing");
    if (changed || force) fillContentEditor(card);
    if (changed && state.content.report?.questionId !== questionId) state.content.report = null;
    renderContentReport();
    renderContentQuestionList();
    if (focus) {
      els.contentEditorTitle.tabIndex = -1;
      els.contentEditorTitle.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 1180px)").matches) els.contentWorkspace.scrollIntoView({ block: "start" });
    }
    return true;
  }

  function backToContentResults() {
    // Going back keeps the draft and the exact filters/page available.
    if (els.contentWorkspace.classList.contains("is-editing")) state.content.editorRevision += 1;
    els.contentWorkspace.classList.remove("is-editing");
    const button = [...els.contentQuestionList.querySelectorAll("[data-content-question]")].find((item) => item.dataset.contentQuestion === state.content.selectedId);
    (button || els.contentSearch).focus();
  }

  async function loadContentCategory({ preserveSelection = false, refresh = false, authorized = false } = {}) {
    if (!authorized && !confirmContentLeave()) { els.contentCategory.value = state.content.category; return; }
    const selected = preserveSelection ? state.content.selectedId : null;
    const category = els.contentCategory.value;
    const version = ++state.content.loadVersion;
    const editorRevision = state.content.editorRevision;
    state.content.loading = true;
    renderContentQuestionList();
    try {
      await loadContentCatalog();
      const categories = state.content.catalog.categories || [];
      const [cards, edits] = await Promise.all([loadStaticCategories(categories, refresh), loadAllContentEdits()]);
      // Any selection, input, or completed save supersedes this refresh, including A → B → A.
      // Discard the whole response so stale metadata cannot replace a newer successful save.
      if (version !== state.content.loadVersion || editorRevision !== state.content.editorRevision) return;
      state.content.cards = cards;
      state.content.edits = new Map(edits.map((edit) => [edit.questionId, edit]));
      state.content.category = category;
      state.content.loaded = true;
      state.content.dirty = false;
      state.content.page = preserveSelection ? state.content.page : 0;
      if (selected && cards.some((card) => card.id === selected)) selectContentQuestion(selected, { force: true, focus: false });
      else {
        state.content.selectedId = null;
        state.content.report = null;
        els.contentEditorForm.hidden = true;
        els.contentEditorEmpty.hidden = false;
        els.contentWorkspace.classList.remove("is-editing");
        renderContentReport();
      }
      renderContentCategoryOptions();
    } catch (error) {
      if (version === state.content.loadVersion) {
        els.contentCategory.value = state.content.category;
        showToast(t("contentSearchFailed"), true);
      }
      throw error;
    } finally {
      if (version === state.content.loadVersion) { state.content.loading = false; renderContentQuestionList(); }
    }
  }

  function changeContentFilters() {
    state.content.page = 0;
    renderContentQuestionList();
  }

  function changeContentCategory() {
    if (!confirmContentLeave()) { els.contentCategory.value = state.content.category; return; }
    state.content.category = els.contentCategory.value;
    if (state.content.dirty && state.content.selectedId) {
      const card = state.content.cards.find((item) => item.id === state.content.selectedId);
      if (card) fillContentEditor(card);
    }
    backToContentResults();
    changeContentFilters();
  }

  function showContentEditorError(error) {
    state.content.messageError = true;
    els.contentEditorMessage.textContent = error instanceof Error ? error.message : t("requestFailed");
    els.contentEditorMessage.hidden = false;
  }

  async function saveContent(workflowStatus, button) {
    const questionId = state.content.selectedId;
    const card = state.content.cards.find((item) => item.id === questionId);
    if (!card || state.content.saving) return;
    let content;
    try { content = contentEditorSnapshot(); } catch (error) { showContentEditorError(error); return; }
    const submittedRaw = rawEditorSnapshot();
    state.content.saving = true;
    setButtonBusy(button, true);
    updateContentDirty();
    state.content.messageError = false;
    els.contentEditorMessage.hidden = true;
    try {
      const result = await api(`/admin/content/${encodeURIComponent(questionId)}`, {
        method: "PUT",
        body: JSON.stringify({ categorySlug: card.categorySlug, content, workflowStatus }),
      });
      state.content.editorRevision += 1;
      const previous = state.content.edits.get(questionId);
      state.content.edits.set(questionId, { ...previous, questionId, categorySlug: card.categorySlug, draft: content,
        workflowStatus, version: result.version || (previous?.version || 0) + 1, editorUserId: state.me.id });
      if (state.content.selectedId === questionId) {
        // A slow save must never replace newer input typed while the request was running.
        state.content.baseline = submittedRaw;
        updateContentDirty();
        renderContentReport();
      }
      renderContentQuestionList();
      showToast(t(state.content.selectedId === questionId && state.content.dirty ? "savedWithChanges" : workflowStatus === "IN_REVIEW" ? "contentSubmitted" : "contentSaved"));
      await loadOverview();
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
      if (state.content.selectedId === questionId) showContentEditorError(error);
    } finally {
      state.content.saving = false;
      setButtonBusy(button, false);
      updateContentDirty();
    }
  }

  async function refreshContentMetadata(questionId, { replaceDraft = false, expectedRaw = "" } = {}) {
    state.content.editorRevision += 1;
    const edits = await loadAllContentEdits();
    state.content.edits = new Map(edits.map((edit) => [edit.questionId, edit]));
    if (state.content.selectedId === questionId) {
      const card = state.content.cards.find((item) => item.id === questionId);
      if (replaceDraft && card && rawEditorSnapshot() === expectedRaw) fillContentEditor(card);
      renderContentEditorChrome();
      renderContentReport();
    }
    renderContentQuestionList();
    await loadOverview();
  }

  async function publishContent(button) {
    const questionId = state.content.selectedId;
    if (!questionId || state.content.saving) return;
    if (state.content.dirty) { showContentEditorError(new Error(t("saveBeforePublish"))); return; }
    if (!await requestStepUp()) return;
    const edit = state.content.edits.get(questionId);
    const review = await requestActionReview({
      actionKey: "publishAction",
      target: questionId,
      impactKey: "publishImpact",
      impactValues: { version: edit?.version || "—" },
      requiresReason: true,
    });
    if (!review) return;
    if (state.content.dirty || state.content.selectedId !== questionId) { showContentEditorError(new Error(t("saveBeforePublish"))); return; }
    state.content.saving = true;
    setButtonBusy(button, true);
    updateContentDirty();
    try {
      await api(`/admin/content/${encodeURIComponent(questionId)}/publish`, {
        method: "POST",
        body: mutationPayload({}, review.reason),
      });
      showToast(t("contentPublished"));
      await Promise.all([refreshContentMetadata(questionId), loadSecurity()]);
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
    } finally {
      state.content.saving = false;
      setButtonBusy(button, false);
      updateContentDirty();
    }
  }

  async function unpublishContent(button) {
    const questionId = state.content.selectedId;
    if (!questionId || state.content.saving) return;
    if (state.content.dirty) { showContentEditorError(new Error(t("saveBeforePublish"))); return; }
    if (!await requestStepUp()) return;
    const edit = state.content.edits.get(questionId);
    const review = await requestActionReview({
      actionKey: "unpublishAction",
      target: questionId,
      impactKey: "unpublishImpact",
      impactValues: { version: edit?.publishedVersion || edit?.version || "—" },
      requiresReason: true,
    });
    if (!review) return;
    if (state.content.dirty || state.content.selectedId !== questionId) { showContentEditorError(new Error(t("saveBeforePublish"))); return; }
    state.content.saving = true;
    setButtonBusy(button, true);
    updateContentDirty();
    try {
      await api(`/admin/content/${encodeURIComponent(questionId)}/unpublish`, {
        method: "POST",
        body: mutationPayload({}, review.reason),
      });
      showToast(t("contentUnpublished"));
      await Promise.all([refreshContentMetadata(questionId), loadSecurity()]);
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
    } finally {
      state.content.saving = false;
      setButtonBusy(button, false);
      updateContentDirty();
    }
  }

  async function loadContentHistory() {
    const questionId = state.content.selectedId;
    if (!questionId) return;
    const data = await api(`/admin/content/${encodeURIComponent(questionId)}/revisions?limit=50`);
    if (state.content.selectedId !== questionId) return;
    state.content.revisions = data.revisions || [];
    els.contentHistory.hidden = false;
    els.contentHistoryList.innerHTML = state.content.revisions.length
      ? state.content.revisions.map((revision) => `<article class="content-revision"><div><strong>v${escapeHtml(revision.version)} · ${escapeHtml(revision.action)}</strong><p>${escapeHtml(revision.actorUsername || "—")} · ${escapeHtml(dateFormat(revision.createdAt, true))}</p></div><button class="quiet-button" type="button" data-content-restore="${escapeHtml(revision.id)}">${escapeHtml(t("restoreRevision"))}</button></article>`).join("")
      : `<div class="empty-state">${escapeHtml(t("noAuditEvents"))}</div>`;
  }

  async function restoreContentRevision(revisionId, button) {
    const questionId = state.content.selectedId;
    if (!questionId || state.content.saving || !confirmContentLeave()) return;
    const expectedRaw = rawEditorSnapshot();
    const revision = state.content.revisions.find((candidate) => candidate.id === revisionId);
    const review = await requestActionReview({
      actionKey: "restoreContentAction",
      target: questionId,
      impactKey: "restoreContentImpact",
      impactValues: { version: revision?.version || "—" },
      requiresReason: true,
    });
    if (!review || state.content.selectedId !== questionId) return;
    state.content.saving = true;
    setButtonBusy(button, true);
    updateContentDirty();
    try {
      await api(`/admin/content/${encodeURIComponent(questionId)}/restore`, {
        method: "POST",
        body: mutationPayload({ revisionId }, review.reason),
      });
      showToast(t("contentRestored"));
      await refreshContentMetadata(questionId, { replaceDraft: true, expectedRaw });
      if (state.content.selectedId === questionId) await loadContentHistory();
      if (state.audit) await loadAudit();
    } catch (error) {
      handleActionError(error);
    } finally {
      state.content.saving = false;
      setButtonBusy(button, false);
      updateContentDirty();
    }
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
    const loadVersion = ++state.feedback.loadVersion;
    const mutationRevision = state.feedback.mutationRevision;
    if (reset) els.feedbackResults.innerHTML = `<div class="loading-state">${escapeHtml(t("loading"))}</div>`;
    const data = await api(feedbackQuery(offset));
    if (loadVersion !== state.feedback.loadVersion || mutationRevision !== state.feedback.mutationRevision) return;
    state.feedback = {
      ...state.feedback,
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

  async function loadPlatformStatus() {
    if (state.me?.role !== "OWNER") return;
    state.platform.loading = true;
    state.platform.error = null;
    renderPlatformStatus();
    try {
      const data = await api("/admin/platform-status");
      state.platform = { data, loading: false, error: null, loaded: true };
      renderPlatformStatus();
      return data;
    } catch (error) {
      state.platform = { ...state.platform, loading: false, error, loaded: true };
      renderPlatformStatus();
      throw error;
    }
  }

  async function loadSecurity() {
    const data = await api("/admin/security");
    state.security = data;
    renderSecurity();
    return data;
  }

  function autopilotRunStatus(status) {
    const keys = { inspecting: "autopilotInspecting", no_changes: "autopilotNoChanges", fixing: "autopilotFixing", testing: "autopilotTesting", release_reserved: "autopilotReleaseReserved", deployed: "autopilotDeployed", failed: "autopilotFailed", rolled_back: "autopilotRolledBack", paused: "autopilotPaused", needs_attention: "autopilotNeedsAttention" };
    return t(keys[status] || "autopilotStatusError");
  }

  function autopilotStatusClass(status) {
    if (["failed", "rolled_back", "needs_attention"].includes(status)) return "is-danger";
    return ["deployed", "no_changes"].includes(status) ? "is-good" : "is-pending";
  }

  function autopilotCount(value) {
    return Number.isFinite(value) && value >= 0 ? numberFormat(value) : "—";
  }

  function autopilotRunLink(value, label) {
    try {
      const url = new URL(value);
      // Receipts are links to GitHub runs, never arbitrary HTML or executable URLs.
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || !/^\/[^/]+\/[^/]+\/actions\/runs\/\d+(?:\/|$)/u.test(url.pathname)) return "";
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(label))}</a>`;
    } catch { return ""; }
  }

  function autopilotRunMarkup(run) {
    const facts = [
      ["autopilotFindings", autopilotCount(run.findings?.total)], ["autopilotRepairs", autopilotCount(run.fixesApplied)],
      ["autopilotChecksPassed", autopilotCount(run.checksPassed)], ["autopilotChecksFailed", autopilotCount(run.checksFailed)],
    ];
    const machineFacts = [["autopilotSourceCommit", run.sourceSha], ["autopilotCandidateCommit", run.candidateSha], ["autopilotBuild", run.buildId], ["autopilotWorkerVersion", run.workerVersion]];
    const findingKeys = { brokenLinks: "autopilotBrokenLinks", accessibility: "autopilotAccessibility", performance: "autopilotPerformance", dependencies: "autopilotDependencies", content: "autopilotContent" };
    const findingDetails = run.findings && typeof run.findings === "object" ? `<details><summary>${escapeHtml(t("autopilotFindingDetail"))}</summary><ul class="autopilot-findings">${Object.entries(findingKeys).map(([key, label]) => `<li>${escapeHtml(t(label))}: ${escapeHtml(autopilotCount(run.findings[key]))}</li>`).join("")}</ul></details>` : "";
    return `<article class="autopilot-run"><div class="autopilot-run-heading"><div><h3>${escapeHtml(run.runId ? t("autopilotRunLabel", { id: run.runId }) : t("autopilotRunUnknown"))}</h3><p><time datetime="${escapeHtml(run.startedAt || "")}">${escapeHtml(dateFormat(run.startedAt, true))}</time></p></div><span class="status-pill ${autopilotStatusClass(run.status)}">${escapeHtml(autopilotRunStatus(run.status))}</span></div>
      <dl class="autopilot-run-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(t(label))}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}${machineFacts.filter(([, value]) => typeof value === "string" && value).map(([label, value]) => `<div><dt>${escapeHtml(t(label))}</dt><dd><bdi class="autopilot-machine" dir="ltr">${escapeHtml(value)}</bdi></dd></div>`).join("")}</dl>
      ${findingDetails}<div class="autopilot-run-links">${autopilotRunLink(run.url, "autopilotViewRun")}${autopilotRunLink(run.deploymentUrl, "autopilotViewDeployment")}</div></article>`;
  }

  function renderAutopilot() {
    if (!els.autopilotStatus) return;
    const { data, phase, pending, errorKey } = state.autopilot;
    const loading = phase === "idle" || phase === "loading";
    const ready = phase === "ready" && Boolean(data);
    const statusKey = pending ? "autopilotUpdating" : loading ? "loading" : phase === "unavailable" ? "autopilotNotConnected" : !ready ? "autopilotStatusError" : data.enabled ? "autopilotActive" : "autopilotPaused";
    els.autopilotStatus.textContent = t(statusKey);
    els.autopilotStatus.className = `status-pill ${phase === "error" ? "is-danger" : ready && data.enabled ? "is-good" : "is-pending"}`;
    els.autopilotStatusMessage.textContent = t(loading ? "loading" : phase === "unavailable" ? "autopilotNotConnectedMessage" : !ready ? "autopilotLoadError" : data.enabled ? "autopilotActiveMessage" : "autopilotPausedMessage");
    els.autopilotError.hidden = !errorKey;
    els.autopilotError.textContent = errorKey ? t(errorKey) : "";
    els.autopilotToggle.hidden = !data;
    els.autopilotToggle.disabled = !ready || pending;
    els.autopilotToggle.textContent = t(pending ? "autopilotUpdating" : data?.enabled ? "autopilotPause" : "autopilotResume");
    els.autopilotToggle.className = data?.enabled ? "secondary-button" : "primary-button";
    els.autopilotRefresh.disabled = loading || pending;
    els.autopilotPanel.setAttribute("aria-busy", String(loading || pending));

    const policy = data?.policy;
    els.autopilotPolicy.innerHTML = policy ? [
      ["autopilotSchedule", policy.schedule === "Daily at 07:23 Dubai" ? t("autopilotDailySchedule") : String(policy.schedule || "—")],
      ["autopilotRunLimit", autopilotCount(policy.maxRunsPerDay)], ["autopilotReleaseLimit", autopilotCount(policy.maxReleasesPerDay)], ["autopilotAiBudget", autopilotCount(policy.aiBudgetUsd)],
    ].map(([label, value]) => `<div><dt>${escapeHtml(t(label))}</dt><dd dir="auto">${escapeHtml(value)}</dd></div>`).join("") : `<div><dt class="sr-only">${escapeHtml(t("autopilotPolicy"))}</dt><dd>${escapeHtml(t("autopilotPolicyUnavailable"))}</dd></div>`;
    els.autopilotBudgetMessage.hidden = policy?.aiBudgetUsd !== 0;
    els.autopilotBudgetMessage.textContent = t("autopilotNoAi");

    const runs = Array.isArray(data?.runs) ? data.runs.filter((run) => run && typeof run === "object").slice(0, 30) : [];
    const last = data?.lastRun;
    const emptyKey = data ? "autopilotNoRuns" : "autopilotActivityUnavailable";
    els.autopilotLastRun.innerHTML = last && typeof last === "object"
      ? `<p><span class="status-pill ${autopilotStatusClass(last.status)}">${escapeHtml(autopilotRunStatus(last.status))}</span></p><p><time datetime="${escapeHtml(last.startedAt || "")}">${escapeHtml(dateFormat(last.startedAt, true))}</time></p>${autopilotRunLink(last.url, "autopilotViewRun")}`
      : `<p class="muted">${escapeHtml(t(emptyKey))}</p>`;
    els.autopilotRuns.innerHTML = runs.length ? runs.map(autopilotRunMarkup).join("") : `<p class="muted">${escapeHtml(t(emptyKey))}</p>`;
  }

  function acceptAutopilotData(data) {
    if (!data || typeof data.enabled !== "boolean" || !data.policy || !Array.isArray(data.runs)) throw new Error("Invalid Autopilot response");
    state.autopilot.data = data;
    state.autopilot.phase = "ready";
    state.autopilot.errorKey = "";
  }

  async function loadAutopilot() {
    if (state.me?.role !== "OWNER" || state.autopilot.pending) return;
    const version = ++state.autopilot.requestVersion;
    state.autopilot.phase = "loading";
    state.autopilot.errorKey = "";
    renderAutopilot();
    try {
      const data = await api("/admin/autopilot");
      if (version !== state.autopilot.requestVersion) return;
      acceptAutopilotData(data);
    } catch (error) {
      if (version !== state.autopilot.requestVersion) return;
      state.autopilot.phase = error instanceof AdminApiError && error.status === 404 ? "unavailable" : "error";
      state.autopilot.errorKey = state.autopilot.phase === "error" ? "autopilotLoadError" : "";
      if (error instanceof AdminApiError && [401, 403].includes(error.status)) handleActionError(error);
    } finally {
      if (version === state.autopilot.requestVersion) renderAutopilot();
    }
  }

  async function toggleAutopilot() {
    if (state.me?.role !== "OWNER" || state.autopilot.pending || state.autopilot.phase !== "ready") return;
    const enabled = !state.autopilot.data.enabled;
    state.autopilot.pending = true;
    state.autopilot.errorKey = "";
    ++state.autopilot.requestVersion;
    renderAutopilot();
    try {
      const data = await api("/admin/autopilot", { method: "POST", body: JSON.stringify({ enabled }) });
      acceptAutopilotData(data);
      showToast(t(data.enabled ? "autopilotResumed" : "autopilotPausedToast"));
    } catch (error) {
      state.autopilot.phase = "error";
      state.autopilot.errorKey = "autopilotUpdateError";
      if (error instanceof AdminApiError && [401, 403].includes(error.status)) handleActionError(error);
    } finally {
      state.autopilot.pending = false;
      renderAutopilot();
    }
  }

  async function refreshVisible(showMessage = false) {
    if (showMessage && state.activeTab === "content" && !confirmContentLeave()) return;
    const tasks = [loadOverview(), loadHealth(), loadSecurity()];
    if (state.activeTab === "people") tasks.push(loadPeople(true));
    if (state.activeTab === "feedback") tasks.push(loadFeedback(true));
    if (state.activeTab === "content") tasks.push(loadContentCategory({ preserveSelection: true, refresh: showMessage, authorized: true }));
    if (state.activeTab === "audit" && state.me?.role === "OWNER") tasks.push(loadAudit());
    if (state.activeTab === "autopilot" && state.me?.role === "OWNER") tasks.push(loadAutopilot());
    if (state.activeTab === "platform-status" && state.me?.role === "OWNER") tasks.push(loadPlatformStatus());
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
    setConnection("is-pending", "checkingAccess");
    try {
      const profile = await api("/user/profile");
      if (!ADMIN_ROLES.has(profile.role)) {
        state.me = null;
        state.gateMode = "unauthorized";
        els.adminApp.hidden = true;
        renderGate();
        setConnection("is-error", "unauthorizedTitle");
        return;
      }
      state.me = profile;
      renderIdentity();
      showApp();
      setConnection("is-online", "accessConnected");
      await refreshVisible(false);
    } catch (error) {
      state.me = null;
      state.gateMode = error instanceof AdminApiError && error.status === 401 ? "signedOut" : "offline";
      els.adminApp.hidden = true;
      renderGate();
      setConnection("is-error", state.gateMode === "signedOut" ? "sessionExpired" : "offlineTitle");
    }
  }

  function selectTab(tab, moveFocus = false, authorized = false) {
    if (["audit", "autopilot", "platform-status"].includes(tab) && state.me?.role !== "OWNER") return false;
    state.activeTab = tab;
    $$("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && moveFocus) button.focus();
    });
    $$("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
    if (tab === "people" && !state.people.items.length) void loadPeople(true).catch(handleActionError);
    if (tab === "feedback" && !state.feedback.items.length) void loadFeedback(true).catch(handleActionError);
    if (tab === "content" && !state.content.loaded && !state.content.loading && !authorized) void loadContentCategory({ authorized: true }).catch(handleActionError);
    if (tab === "audit" && !state.audit) void loadAudit().catch(handleActionError);
    if (tab === "autopilot" && ["idle", "error", "unavailable"].includes(state.autopilot.phase)) void loadAutopilot();
    if (tab === "platform-status" && !state.platform.loaded && !state.platform.loading) void loadPlatformStatus().catch(handleActionError);
    return true;
  }

  function handleActionError(error) {
    if (error instanceof AdminApiError) {
      if (error.status === 401 && error.code === "STEP_UP_REQUIRED") {
        state.security = null;
        showToast(t("highImpactConfirmation"), true);
        return;
      }
      if (error.status === 401) {
        state.me = null;
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
    els.actionReviewReasonLabel.textContent = t("reasonOptional");
    els.actionReviewReasonHint.textContent = t("reasonHint");
    els.actionReviewReason.required = false;
    els.actionReviewReason.removeAttribute("aria-required");
    els.actionReviewReason.removeAttribute("aria-invalid");
    els.actionReviewReasonError.textContent = "";
    els.actionReviewReasonError.hidden = true;
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
    const requiresReason = Boolean(review.requiresReason);
    const requiresTypedConfirmation = Boolean(review.requiresTypedConfirmation);
    els.actionReviewAction.textContent = t(review.actionKey);
    els.actionReviewTarget.textContent = review.target;
    els.actionReviewImpact.textContent = t(review.impactKey, review.impactValues);
    els.actionReviewReasonLabel.textContent = t(requiresReason ? "reasonRequired" : "reasonOptional");
    els.actionReviewReasonHint.textContent = t(requiresReason ? "reasonRequiredHint" : "reasonHint");
    els.actionReviewReason.required = requiresReason;
    if (requiresReason) els.actionReviewReason.setAttribute("aria-required", "true");
    else els.actionReviewReason.removeAttribute("aria-required");
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
    if (review.initialReason) els.actionReviewReason.value = review.initialReason;
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
    if (review.requiresReason && !actionReviewReason()) {
      els.actionReviewReasonError.textContent = t("reasonRequiredMessage");
      els.actionReviewReasonError.hidden = false;
      els.actionReviewReason.setAttribute("aria-invalid", "true");
      els.actionReviewReason.focus();
      return;
    }
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

  function clearActionReviewReasonError() {
    els.actionReviewReasonError.hidden = true;
    els.actionReviewReason.removeAttribute("aria-invalid");
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
    const suggestion = state.feedback.items.find((item) => item.id === suggestionId);
    if (!suggestionId || !suggestion) return;
    const status = select.value;
    const previousStatus = suggestion.status;
    if (state.feedback.pending.has(suggestionId)) { select.value = previousStatus; return; }
    if (status === previousStatus) return;
    const submittedDraft = feedbackDraftValue(suggestionId);
    setFeedbackPending(suggestionId, true);
    try {
      const review = await requestActionReview({
        actionKey: "feedbackStateAction",
        target: suggestionId,
        impactKey: "feedbackStateImpact",
        impactValues: { status: statusLabel(status) },
        requiresReason: status === "implemented" || status === "rejected",
        initialReason: normalizeFeedbackNote(submittedDraft),
      });
      if (!review) { select.value = previousStatus; return; }
      await api(`/admin/suggestions/${encodeURIComponent(suggestionId)}`, {
        method: "PATCH", body: mutationPayload({ status }, review.reason),
      });
      state.feedback.mutationRevision += 1;
      // Keep local status current even if the following list refresh fails.
      const current = state.feedback.items.find((item) => item.id === suggestionId);
      if (current) current.status = status;
      select.dataset.feedbackCurrent = status;
      if (review.reason) clearSubmittedFeedbackDraft(suggestionId, submittedDraft, review.reason);
      await refreshFeedbackAfterMutation();
      showToast(t("feedbackUpdated"));
    } catch (error) {
      handleActionError(error);
      select.value = previousStatus;
    } finally {
      setFeedbackPending(suggestionId, false);
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

  function keepEditorFocusVisible(event) {
    const target = event.target;
    const actions = $(".content-editor-actions");
    if (!target.matches("input, textarea, select, button") || actions.contains(target)) return;
    requestAnimationFrame(() => {
      const bounds = target.getBoundingClientRect();
      const footer = actions.getBoundingClientRect();
      const visibleBottom = Math.min(window.innerHeight, footer.top);
      if (bounds.bottom > visibleBottom - 12) window.scrollBy({ top: bounds.bottom - visibleBottom + 20, behavior: "instant" });
      else if (bounds.top < 12) window.scrollBy({ top: bounds.top - 20, behavior: "instant" });
    });
  }

  function bindEvents() {
    els.languageToggle.addEventListener("click", () => {
      state.lang = state.lang === "ar" ? "en" : "ar";
      persistLanguage();
      applyLanguage();
    });
    els.refreshButton.addEventListener("click", () => void refreshVisible(true));
    els.logoutButton.addEventListener("click", async () => {
      if (!confirmWorkspaceLeave()) return;
      setButtonBusy(els.logoutButton, true);
      try {
        await api("/auth/logout", { method: "POST", body: "{}" });
        state.content.dirty = false;
        state.feedback.drafts.clear();
        location.assign(state.lang === "ar" ? "/?lang=ar" : "/");
      } catch {
        showToast(t("signOutFailed"), true);
        els.logoutButton.focus();
      } finally {
        setButtonBusy(els.logoutButton, false, t("signOut"));
      }
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
      const report = event.target.closest("[data-feedback-open-question]");
      if (report) void openFeedbackQuestion(report.dataset.feedbackOpenQuestion).catch(handleActionError);
      const note = event.target.closest("[data-feedback-save-note]");
      if (note) void saveFeedbackNote(note);
      const reference = event.target.closest("[data-open-content-id]");
      if (reference) void openContentReference(reference.dataset.openContentCategory, reference.dataset.openContentId).catch(handleActionError);
      const returnFeedback = event.target.closest("[data-return-feedback]");
      if (returnFeedback && selectTab("feedback")) {
        const id = state.content.report?.suggestionId;
        const button = [...els.feedbackResults.querySelectorAll("[data-feedback-open-question]")].find((item) => item.dataset.feedbackOpenQuestion === id);
        button?.focus();
      }
      const queue = event.target.closest("[data-content-queue]");
      if (queue && selectTab("content")) {
        state.content.category = "";
        els.contentSearch.value = "";
        els.contentCategorySearch.value = "";
        els.contentStatus.value = queue.dataset.contentQueue;
        renderContentCategoryOptions();
        backToContentResults();
        changeContentFilters();
      }
      const feedbackQueue = event.target.closest("[data-feedback-queue]");
      if (feedbackQueue) {
        els.feedbackStatus.value = feedbackQueue.dataset.feedbackQueue;
        if (selectTab("feedback", false, true)) void loadFeedback(true).catch(handleActionError);
      }
      const sourceRemove = event.target.closest("[data-source-remove]");
      if (sourceRemove) {
        const sources = sourceValues();
        sources.splice(Number(sourceRemove.dataset.sourceRemove), 1);
        renderContentSources(sources);
        updateContentDirty();
        els.contentAddSource.focus();
      }
      const editorLanguage = event.target.closest("[data-editor-language]");
      if (editorLanguage) setEditorLanguage(editorLanguage.dataset.editorLanguage);
      const link = event.target.closest("a[href]");
      const sameDocumentFragment = link && link.href.includes("#")
        && link.origin === location.origin && link.pathname === location.pathname && link.search === location.search;
      if (link && !sameDocumentFragment && hasUnsavedWork() && link.target !== "_blank" && !event.metaKey && !event.ctrlKey) {
        if (!confirmWorkspaceLeave()) event.preventDefault();
        else { state.content.dirty = false; state.feedback.drafts.clear(); }
      }
      const ban = event.target.closest("[data-user-ban]");
      if (ban) void changeUserBan(ban);
      const question = event.target.closest("[data-content-question]");
      if (question) selectContentQuestion(question.dataset.contentQuestion);
      const restoreRevision = event.target.closest("[data-content-restore]");
      if (restoreRevision) void restoreContentRevision(restoreRevision.dataset.contentRestore, restoreRevision);
    });
    document.addEventListener("input", (event) => {
      const input = event.target;
      if (!input.matches("[data-feedback-resolution]")) return;
      if (input.value) state.feedback.drafts.set(input.dataset.feedbackResolution, input.value);
      else state.feedback.drafts.delete(input.dataset.feedbackResolution);
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
    els.autopilotRefresh.addEventListener("click", () => void loadAutopilot());
    els.autopilotToggle.addEventListener("click", () => void toggleAutopilot());
    els.platformRefreshButton.addEventListener("click", () => void loadPlatformStatus().catch(handleActionError));
    els.contentLoadButton.addEventListener("click", () => void loadContentCategory({ preserveSelection: true, refresh: true }).catch(handleActionError));
    els.contentCategory.addEventListener("change", changeContentCategory);
    els.contentCategorySearch.addEventListener("input", () => { renderContentCategoryOptions(); renderContentFilters(); });
    els.contentSearch.addEventListener("input", changeContentFilters);
    els.contentStatus.addEventListener("change", changeContentFilters);
    els.contentPageSize.addEventListener("change", changeContentFilters);
    els.contentPreviousPage.addEventListener("click", () => { state.content.page = Math.max(0, state.content.page - 1); renderContentQuestionList(); });
    els.contentNextPage.addEventListener("click", () => { state.content.page += 1; renderContentQuestionList(); });
    els.contentClearFilters.addEventListener("click", () => {
      els.contentSearch.value = "";
      els.contentStatus.value = "";
      els.contentCategorySearch.value = "";
      state.content.category = "";
      renderContentCategoryOptions();
      changeContentFilters();
    });
    els.contentEditorForm.addEventListener("submit", (event) => event.preventDefault());
    els.contentEditorForm.addEventListener("focusin", keepEditorFocusVisible);
    const actionBar = $(".content-editor-actions");
    const measureActionBar = () => document.documentElement.style.setProperty("--content-action-height", `${Math.ceil(actionBar.getBoundingClientRect().height)}px`);
    if (typeof ResizeObserver === "function") new ResizeObserver(measureActionBar).observe(actionBar);
    else window.addEventListener("resize", measureActionBar);
    measureActionBar();
    els.contentEditorForm.addEventListener("input", (event) => {
      event.target.removeAttribute("aria-invalid");
      updateContentDirty();
      renderContentPreview();
    });
    els.contentBackButton.addEventListener("click", backToContentResults);
    els.contentAddSource.addEventListener("click", () => {
      const sources = sourceValues();
      if (sources.length >= 8) return;
      renderContentSources([...sources, { title: "", publisher: "", url: "" }]);
      updateContentDirty();
      els.contentSourceList.lastElementChild.querySelector("input").focus();
    });
    els.contentPreviewLanguage.addEventListener("change", () => { state.content.previewLanguage = els.contentPreviewLanguage.value; renderContentPreview(); });
    $(".editor-language-tabs").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = $$('[data-editor-language]');
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const direction = (event.key === "ArrowRight" ? 1 : -1) * (state.lang === "ar" ? -1 : 1);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
      setEditorLanguage(tabs[next].dataset.editorLanguage, true);
    });
    window.addEventListener("beforeunload", (event) => {
      if (!hasUnsavedWork()) return;
      event.preventDefault();
      event.returnValue = "";
    });
    els.contentSaveDraft.addEventListener("click", () => void saveContent("DRAFT", els.contentSaveDraft));
    els.contentSubmitReview.addEventListener("click", () => void saveContent("IN_REVIEW", els.contentSubmitReview));
    els.contentPublish.addEventListener("click", () => void publishContent(els.contentPublish));
    els.contentUnpublish.addEventListener("click", () => void unpublishContent(els.contentUnpublish));
    els.contentHistoryButton.addEventListener("click", () => void loadContentHistory().catch(handleActionError));
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
    els.actionReviewReason.addEventListener("input", clearActionReviewReasonError);
    els.actionReviewTypedConfirmation.addEventListener("input", clearTypedConfirmationError);
    els.actionReviewDialog.addEventListener("close", resolveActionReview);
  }

  function cacheElements() {
    [
      "connectionState", "languageToggle", "viewSite", "refreshButton", "logoutButton",
      "gate", "gateTitle", "gateMessage", "gateActions", "adminApp", "identityAvatar", "identityName", "identityRole",
      "auditTab", "platformStatusTab", "platformStatusPanel", "sessionControlCard", "adminTabs", "metricGrid", "feedbackCount", "lastUpdated", "healthPill", "healthMessage",
      "actionQueue", "recentUsers", "recentSuggestions", "peopleSearch", "peopleRole", "peopleStatus", "peopleSearchButton",
      "peoplePrivacyNotice", "peopleResults", "loadMorePeople", "feedbackStatus", "feedbackFilterButton", "feedbackResults", "loadMoreFeedback",
      "reloadAudit", "auditResults", "platformRefreshButton", "platformOverallPill", "platformOverviewTitle", "platformOverallDetail", "platformUpdatedAt", "platformMetricGrid", "platformSourceGrid", "stepUpPill", "stepUpMessage", "reauthenticateButton", "revokeSessionsButton",
      "reauthDialog", "reauthForm", "reauthPassword", "reauthError", "reauthSubmit", "reauthCancel", "toastRegion",
      "actionReviewDialog", "actionReviewForm", "actionReviewAction", "actionReviewTarget", "actionReviewImpact", "actionReviewReason",
      "actionReviewReasonLabel", "actionReviewReasonHint", "actionReviewReasonError",
      "actionReviewTypedConfirmationWrap", "actionReviewTypedLead", "actionReviewTypedConfirmation", "actionReviewTypedError",
      "actionReviewConfirm", "actionReviewCancel",
      "contentCategory", "contentSearch", "contentStatus", "contentLoadButton", "contentResultsSummary", "contentQuestionList",
      "contentEditorEmpty", "contentEditorForm", "contentEditorStatus", "contentEditorTitle", "contentHistoryButton",
      "contentQuestionEn", "contentQuestionAr", "contentAnswerEn", "contentAnswerAr", "contentExplanationEn", "contentExplanationAr",
      "contentSourceList", "contentPreviewCard", "contentEditorMessage", "contentSaveDraft", "contentSubmitReview", "contentPublish",
      "contentUnpublish", "contentHistory", "contentHistoryList",
      "contentCategorySearch", "contentActiveFilters", "contentClearFilters", "contentPageSize", "contentPageInfo", "contentPreviousPage", "contentNextPage",
      "contentWorkspace", "contentBackButton", "contentPreviewLanguage", "contentAddSource", "contentSaveState", "contentReportContext", "contentPublishedState",
      "recentEdits", "accountMetricGrid",
      "autopilotTab", "autopilotPanel", "autopilotStatus", "autopilotStatusMessage", "autopilotError", "autopilotRefresh", "autopilotToggle",
      "autopilotPolicy", "autopilotBudgetMessage", "autopilotLastRun", "autopilotRuns",
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    applyLanguage();
    bindEvents();
    void establishAccess();
  });
})();
