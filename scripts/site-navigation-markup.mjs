// One progressively enhanced navigation contract for every public page.
export const navigationScript = '<script defer src="/site-navigation.js"></script>';

export function siteHeader({ lang = 'en', alternate = '/', active = '' } = {}) {
  const ar = lang === 'ar';
  const links = [
    ['home', ar ? '/ar/' : '/', ar ? 'الرئيسية' : 'Home'],
    ['library', ar ? '/ar/mind-lab/' : '/mind-lab', ar ? 'ألغاز واختبارات' : 'Riddles &amp; Quizzes'],
    ['games', ar ? '/ar/play/' : '/play', ar ? 'الألعاب' : 'Games'],
    ['daily', ar ? '/ar/daily/' : '/daily', ar ? 'التحدي اليومي' : 'Daily Challenge'],
  ];
  return `<header class="site-header shell unified-header">
      <a href="${ar ? '/ar/' : '/'}" class="brand" aria-label="${ar ? 'الصفحة الرئيسية لريدل أرابيا' : 'Riddle Arabia home'}"><img src="/assets/riddlearabia-logo.webp" alt="Riddle Arabia" class="brand-logo" width="1536" height="1024" fetchpriority="high" /></a>
      <nav class="primary-navigation" aria-label="${ar ? 'التنقل الرئيسي' : 'Primary navigation'}">
        ${links.map(([key, href, label]) => `<a href="${href}" data-nav="${key}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('\n        ')}
      </nav>
      <div class="site-utilities">
        <a class="language-route-link" href="${alternate.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" hreflang="${ar ? 'en' : 'ar'}" lang="${ar ? 'en' : 'ar'}" dir="${ar ? 'ltr' : 'rtl'}" aria-label="${ar ? 'Read this page in English' : 'اقرأ هذه الصفحة بالعربية'}">${ar ? 'English' : 'العربية'}</a>
        <a id="openAuthBtn" data-site-profile href="${ar ? '/ar/mind-lab/' : '/mind-lab'}?profile=1">${ar ? 'حسابي' : 'Profile'}</a>
      </div>
    </header>`;
}
