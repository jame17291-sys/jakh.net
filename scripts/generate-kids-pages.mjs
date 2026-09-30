#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteHeader } from './site-navigation-markup.mjs';
import { KIDS_AGES, KIDS_AREAS, makeResources, pair } from './kids-resources.mjs';
import { loadLegacy } from './kids-legacy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://riddlearabia.com';
const e = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
// Keep age ranges and arithmetic expressions in logical reading order in RTL prose.
const rtlRanges = value => Array.isArray(value) ? value.map(rtlRanges) : typeof value === 'string' ? value.replace(/(?<![0-9٠-٩۰-۹])([0-9٠-٩۰-۹]+(?:[.:٫٬][0-9٠-٩۰-۹]+)*(?:\s*[+−×÷=<>–/-]\s*[0-9٠-٩۰-۹]+(?:[.:٫٬][0-9٠-٩۰-۹]+)*)+)(?![0-9٠-٩۰-۹])/gu, '\u2066\u202d$1\u202c\u2069') : value;
const loc = (value, lang) => lang === 'ar' ? rtlRanges(value?.[lang] ?? '') : value?.[lang] ?? '';
export const kidsBase = lang => lang === 'ar' ? '/ar/topics/kids-riddles/' : '/kids-riddles';
export const kidsPath = (lang, suffix = '') => suffix ? `${kidsBase(lang).replace(/\/$/, '')}/${suffix}/` : kidsBase(lang);
export const activityPath = (lang, id) => kidsPath(lang, `activities/${id}`);
export const KIDS_INVENTORY = JSON.parse(fs.readFileSync(path.join(root, 'data/kids/inventory.json'), 'utf8'));
export const KIDS_ACTIVITY_FILES = KIDS_INVENTORY.activitySources.map(file => `data/kids/${file}`);
export function loadKidsContent() {
  const activities = KIDS_ACTIVITY_FILES.flatMap(file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
  const required = KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AGES.length * KIDS_AREAS.length;
  if (activities.length !== required || new Set(activities.map(a => a.id)).size !== required) throw Error(`Kids release requires ${required} unique activities.`);
  for (const age of KIDS_AGES) for (const area of KIDS_AREAS) {
    if (activities.filter(a => a.age === age.id && a.area === area.id).length !== KIDS_INVENTORY.activitiesPerAgeAndArea) throw Error(`Kids inventory mismatch: ${age.id}/${area.id}`);
  }
  return { schemaVersion: 1, activities, ...makeResources(activities), legacy: loadLegacy(root) };
}
export function kidsRoutePairs(content = loadKidsContent()) {
  const suffixes = ['', 'activities', 'printables', 'weekly-plans', 'parents', 'riddles',
    ...content.ages.map(a => `ages/${a.id}`), ...content.areas.map(a => `areas/${a.id}`),
    ...content.activities.map(a => `activities/${a.id}`), ...content.packs.map(p => `printables/${p.id}`),
    ...content.plans.map(p => `weekly-plans/${p.id}`), ...content.guides.map(g => `parents/${g.id}`)];
  return suffixes.map(suffix => ({ en: kidsPath('en', suffix), ar: kidsPath('ar', suffix), priority: suffix ? '0.65' : '0.90', lastModified: '2026-09-30' }));
}

const formats = { story: pair('Story', 'قصة'), puzzle: pair('Puzzle', 'لغز'), game: pair('Game', 'لعبة'), making: pair('Making', 'صنع'), experiment: pair('Experiment', 'تجربة'), movement: pair('Movement', 'حركة') };
const materials = { none: pair('No materials', 'دون مواد'), paper: pair('Paper & pencils', 'ورق وأقلام'), household: pair('Household objects', 'أشياء منزلية'), craft: pair('Simple craft supplies', 'أدوات أشغال بسيطة') };
const reading = { adult: pair('Read with a grown-up', 'قراءة بمساعدة بالغ'), early: pair('Early reader', 'قارئ مبتدئ'), independent: pair('Independent reader', 'قارئ مستقلّ') };
const adults = { together: pair('Play together', 'نلعب معًا'), nearby: pair('Grown-up nearby', 'بالغ بالقرب منك'), independent: pair('Try independently', 'تجربة مستقلّة') };
const ui = (lang, en, ar) => lang === 'ar' ? rtlRanges(ar) : en;
const ageText = (id, lang) => ui(lang, `Ages ${id.replace('-', '–')}`, `الأعمار ${id.replace('-', '–')}`);
const timeText = (minutes, lang) => ui(lang, `${minutes} min`, `${minutes} ${minutes <= 10 ? "دقائق" : "دقيقة"}`);
function list(values, tag = 'ul', cls = '') { return `<${tag}${cls ? ` class="${cls}"` : ''}>${values.map(v => `<li>${e(v)}</li>`).join('')}</${tag}>`; }
function sectionHead(title, subtitle = '', extra = '') { return `<div class="kids-section-heading"><div><h2>${e(title)}</h2>${subtitle ? `<p>${e(subtitle)}</p>` : ''}</div>${extra}</div>`; }
function art(name, cls = '', eager = false) {
  if (!fs.existsSync(path.join(root, `assets/illustrations/${name}-480.webp`))) name = 'kids-riddles';
  return `<img class="${cls}" src="/assets/illustrations/${name}-480.webp" srcset="/assets/illustrations/${name}-480.webp 480w, /assets/illustrations/${name}-960.webp 960w" sizes="(max-width: 600px) 160px, 300px" width="960" height="640" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''} />`;
}
function layout({lang, suffix = '', title, description, content, type = 'hub', activity, schema}) {
  const canonical = kidsPath(lang, suffix), alternate = kidsPath(lang === 'ar' ? 'en' : 'ar', suffix);
  const name = `${title} | ${ui(lang, 'Riddle Arabia', 'ريدل أرابيا')}`;
  const structured = schema || { '@type': 'CollectionPage', name: title, description };
  const json = JSON.stringify({ '@context': 'https://schema.org', ...structured, url: origin + canonical, inLanguage: lang, isPartOf: { '@id': origin + '/#website' }, isAccessibleForFree: true }).replaceAll('<', '\\u003c');
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#fffaf2" />
  <title>${e(name)}</title><meta name="description" content="${e(description)}" />
  <link rel="canonical" href="${origin}${canonical}" />
  <link rel="alternate" hreflang="en" href="${origin}${kidsPath('en', suffix)}" />
  <link rel="alternate" hreflang="ar" href="${origin}${kidsPath('ar', suffix)}" />
  <link rel="alternate" hreflang="x-default" href="${origin}${kidsPath('en', suffix)}" />
  <meta name="robots" content="${type === 'toolkit' ? 'noindex' : 'index'},follow,max-image-preview:large" />
  <meta property="og:title" content="${e(name)}" /><meta property="og:description" content="${e(description)}" />
  <meta property="og:type" content="website" /><meta property="og:url" content="${origin}${canonical}" />
  <meta property="og:locale" content="${lang === 'ar' ? 'ar_AE' : 'en_US'}" /><meta property="og:site_name" content="Riddle Arabia" />
  <meta property="og:image" content="${origin}/assets/riddlearabia-og-image.png" /><meta property="og:image:type" content="image/png" /><meta property="og:image:width" content="600" /><meta property="og:image:height" content="315" /><meta property="og:image:alt" content="${e(ui(lang, 'Riddle Arabia — learning and play in Arabic and English', 'ريدل أرابيا — تعلّم ولعب بالعربية والإنجليزية'))}" />
  <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${e(name)}" /><meta name="twitter:description" content="${e(description)}" /><meta name="twitter:image" content="${origin}/assets/riddlearabia-og-image.png" /><meta name="twitter:image:alt" content="${e(title)}" />
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" />
  <link rel="stylesheet" href="/styles.css?v=2026091102" /><link rel="stylesheet" href="/kids-learning.css" />
  <script type="application/ld+json">${json}</script>
  <script defer src="/privacy-consent.js?v=2026080101"></script><script defer src="/site-navigation.js"></script>
  <script type="module" src="/kids-learning.js"></script>
</head>
<body class="kids-page" data-kids-page="${type}"${activity ? ` data-kids-activity="${activity.id}"` : ''} data-route-lang="${lang}">
<a class="skip-link" href="#top">${ui(lang, 'Skip to main content', 'انتقل إلى المحتوى الرئيسي')}</a>
${siteHeader({lang, alternate, active: 'kids'}).replace('class="language-route-link"', 'class="language-route-link" data-kids-language')}
<main id="top" class="kids-shell" tabindex="-1">
${suffix ? `<nav class="kids-breadcrumb" aria-label="${ui(lang, 'Breadcrumb', 'مسار التنقّل')}"><a href="${kidsBase(lang)}">${ui(lang, 'Kids Learning & Play', 'عالم الأطفال: تعلّم والعب')}</a><span aria-hidden="true"> / </span><span aria-current="page">${e(title)}</span></nav>` : ''}
${content}
</main>
<footer class="kids-footer kids-shell"><p>${ui(lang, 'Small discoveries. Shared moments. At your own pace.', 'اكتشافات صغيرة ولحظات مشتركة، بالوتيرة التي تناسبكم.')}</p><nav aria-label="${ui(lang, 'Kids resources', 'موارد الأطفال')}"><a href="${kidsPath(lang, 'parents')}">${ui(lang, 'For parents', 'للأهل')}</a><a href="${kidsPath(lang, 'toolkit')}">${ui(lang, 'My family toolkit', 'أدوات الأسرة')}</a><a href="${lang === 'ar' ? '/ar/privacy/' : '/privacy'}">${ui(lang, 'Privacy', 'الخصوصية')}</a></nav><small>© 2026 Riddle Arabia</small></footer>
<p class="kids-status" data-kids-status role="status" aria-live="polite" aria-atomic="true"></p>
</body></html>\n`;
}
function hero(lang, title, description, {eyebrow = '', image = 'topic-kids-riddles', action = true} = {}) {
  return `<section class="kids-hero"><div class="kids-hero-copy"><p class="kids-eyebrow">${e(eyebrow || ui(lang, 'A little curiosity, a world of discovery', 'فضول صغير، وعالم من الاكتشاف'))}</p><h1>${e(title)}</h1><p class="kids-lead">${e(description)}</p>${action ? `<div class="kids-actions"><a class="kids-button" href="#find">${ui(lang, 'Find an activity', 'ابحث عن نشاط')}</a><a class="kids-button secondary" href="${kidsPath(lang, 'weekly-plans')}">${ui(lang, 'Plan a playful week', 'خطّط لأسبوع مرح')}</a></div><p class="kids-note">${ui(lang, 'Ages 3–12 · Arabic & English · Free, with no account needed', 'الأعمار 3–12 · العربية والإنجليزية · مجانًا دون حساب')}</p>` : ''}</div>${art(image, 'kids-hero-art', true)}</section>`;
}
function ageCards(lang) { return `<div class="kids-age-grid">${KIDS_AGES.map(a => `<a class="kids-age-card" data-age="${a.id}" href="${kidsPath(lang, `ages/${a.id}`)}"><span class="kids-eyebrow">${ageText(a.id, lang)}</span><h3>${e(loc(a.title, lang))}</h3><p>${e(loc(a.description, lang))}</p><span>${ui(lang, `Explore ${KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AREAS.length} activities`, `استكشف ${KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AREAS.length} نشاطًا`)} <span aria-hidden="true">${lang === 'ar' ? '←' : '→'}</span></span></a>`).join('')}</div>`; }
function areaCards(lang) { return `<div class="kids-area-grid">${KIDS_AREAS.map(a => `<a class="kids-area-card" data-area="${a.id}" href="${kidsPath(lang, `areas/${a.id}`)}">${art(a.image, 'kids-card-icon')}<h3>${e(loc(a.title, lang))}</h3><p>${e(loc(a.description, lang))}</p><span>${ui(lang, `${KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AGES.length} activities`, `${KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AGES.length} نشاطًا`)}</span></a>`).join('')}</div>`; }
function select(name, label, values, lang, selected = '') {
  return `<label><span>${e(label)}</span><select name="${name}"><option value="">${ui(lang, 'Any', 'الكلّ')}</option>${values.map(([id, text]) => `<option value="${id}"${selected === id ? ' selected' : ''}>${e(text)}</option>`).join('')}</select></label>`;
}
function finder(lang, defaults = {}) {
  return `<form data-kids-filters class="kids-filter-panel" id="find" role="search" aria-label="${ui(lang, 'Find a kids activity', 'ابحث عن نشاط للأطفال')}">${sectionHead(ui(lang, 'What shall we explore today?', 'ماذا نستكشف اليوم؟'), ui(lang, 'Choose a starting point. Change any choice as you go.', 'اختر نقطة بداية، وغيّر اختياراتك متى شئت.'))}<div class="kids-filter-grid">${select('age', ui(lang, 'Child’s age', 'عمر الطفل'), KIDS_AGES.map(a => [a.id, ageText(a.id, lang)]), lang, defaults.age)}${select('area', ui(lang, 'Learning interest', 'مجال الاهتمام'), KIDS_AREAS.map(a => [a.id, loc(a.title, lang)]), lang, defaults.area)}${select('minutes', ui(lang, 'Time available', 'الوقت المتاح'), [5,10,15,20,30].map(m => [String(m), ui(lang, `Up to ${m} minutes`, `حتى ${m} ${m <= 10 ? "دقائق" : "دقيقة"}`)]), lang)}<label class="kids-search"><span>${ui(lang, 'Search activities', 'ابحث في الأنشطة')}</span><input name="search" type="search" placeholder="${ui(lang, 'Stories, shadows, shapes…', 'قصص، ظلال، أشكال…')}" autocomplete="off" /></label></div><details class="kids-more-filters"><summary>${ui(lang, 'Materials, reading support & more', 'المواد والمساعدة في القراءة والمزيد')}</summary><div class="kids-filter-grid">${select('materialGroup', ui(lang, 'Materials at hand', 'المواد المتوفّرة'), Object.entries(materials).map(([k,v]) => [k,loc(v,lang)]), lang)}${select('format', ui(lang, 'Activity type', 'نوع النشاط'), Object.entries(formats).map(([k,v]) => [k,loc(v,lang)]), lang)}${select('reading', ui(lang, 'Reading support', 'المساعدة في القراءة'), Object.entries(reading).map(([k,v]) => [k,loc(v,lang)]), lang)}${select('adult', ui(lang, 'Grown-up involvement', 'مشاركة البالغ'), Object.entries(adults).map(([k,v]) => [k,loc(v,lang)]), lang)}</div><div class="kids-checks"><label><input type="checkbox" name="screenFree" /> ${ui(lang, 'Screen-free play', 'لعب بعيدًا عن الشاشة')}</label><label><input type="checkbox" name="noPrinter" /> ${ui(lang, 'No printer needed', 'لا يحتاج إلى طابعة')}</label></div></details><div class="kids-actions"><a class="kids-button" href="#activities">${ui(lang, 'See matching activities', 'عرض الأنشطة المطابقة')}</a><button type="button" class="kids-button secondary" data-kids-reset-filters>${ui(lang, 'Reset choices', 'إعادة ضبط الاختيارات')}</button></div><noscript><p>${ui(lang, 'Browse the age and learning-area pages below, or read every activity in the library. Interactive filters and the toolkit need JavaScript.', 'تصفّح صفحات الأعمار ومجالات التعلّم أدناه، أو اقرأ جميع أنشطة المكتبة. تحتاج التصفية التفاعلية وأدوات الأسرة إلى تشغيل جافاسكريبت.')}</p></noscript></form>`;
}
function activityCard(a, lang) {
  const area = KIDS_AREAS.find(v => v.id === a.area);
  return `<article class="kids-activity-card" data-activity-card data-activity-id="${a.id}"><div class="kids-card-meta"><span class="kids-tag">${ageText(a.age, lang)}</span><span>${timeText(a.minutes, lang)}</span></div><p class="kids-eyebrow">${e(loc(area.title, lang))} · ${e(loc(formats[a.format], lang))}</p><h3><a href="${activityPath(lang, a.id)}">${e(loc(a.title, lang))}</a></h3><p>${e(loc(a.summary, lang))}</p><p class="kids-note">${e(loc(materials[a.materialGroup], lang))} · ${e(loc(adults[a.adult], lang))}</p><div class="kids-card-actions"><a class="kids-button" href="${activityPath(lang, a.id)}">${ui(lang, 'Try this activity', 'جرّب هذا النشاط')}</a><button type="button" class="kids-button secondary" data-kids-save="${a.id}" aria-pressed="false">${ui(lang, 'Save', 'حفظ')}</button></div></article>`;
}
function library(activities, lang) { return `<section class="kids-section" id="activities">${sectionHead(ui(lang, 'The activity library', 'مكتبة الأنشطة'), ui(lang, 'Start small. Follow an interest. Try something together.', 'ابدأ بخطوة صغيرة، واتبع الاهتمام، وجرّبوا معًا.'))}<p data-kids-count>${ui(lang, `${activities.length} activities`, `${activities.length} نشاطًا`)}</p><p class="kids-empty" data-kids-empty hidden>${ui(lang, 'No activities match all those choices. Try a longer time or reset one filter.', 'لا توجد أنشطة تطابق كلّ الاختيارات. جرّب وقتًا أطول أو أعد ضبط أحد الخيارات.')}</p><div class="kids-card-grid">${activities.map(a => activityCard(a, lang)).join('')}</div><button type="button" class="kids-button secondary" data-kids-more hidden>${ui(lang, 'Show more activities', 'عرض مزيد من الأنشطة')}</button></section>`; }
function resourceCard(item, lang, kind) {
  const label = {printables: pair('Open printable pack', 'افتح الحزمة القابلة للطباعة'), 'weekly-plans': pair('Explore this week', 'استكشف هذا الأسبوع'), parents: pair('Read the guide', 'اقرأ الدليل')}[kind];
  return `<article class="kids-resource-card">${item.age ? `<p class="kids-eyebrow">${ageText(item.age,lang)}</p>` : ''}<h3><a href="${kidsPath(lang, `${kind}/${item.id}`)}">${e(loc(item.title,lang))}</a></h3><p>${e(loc(item.description,lang))}</p><a class="kids-button secondary" href="${kidsPath(lang, `${kind}/${item.id}`)}">${loc(label,lang)}</a></article>`;
}
function resourcesSection(items, lang, kind, title, description, limit) {
  return `<section class="kids-section" id="${kind}">${sectionHead(title, description, `<a href="${kidsPath(lang,kind)}">${ui(lang, 'View all', 'عرض الكلّ')}</a>`)}<div class="kids-resource-grid">${items.slice(0,limit ?? items.length).map(item => resourceCard(item,lang,kind)).join('')}</div></section>`;
}
function toolkit(lang, full = true) {
  return `<section class="kids-section kids-toolkit" id="toolkit">${sectionHead(ui(lang, 'Your family toolkit', 'أدوات أسرتك'), ui(lang, 'A little less searching. A little more time together.', 'وقت أقل في البحث، ووقت أكثر معًا.'))}<p class="kids-note" data-kids-storage-note>${ui(lang, 'Saved in this browser on this device. No child names, birthdays or accounts. Clearing browser data removes your toolkit.', 'تُحفظ هنا في هذا المتصفّح على هذا الجهاز، دون أسماء أطفال أو تواريخ ميلاد أو حسابات. يؤدي مسح بيانات المتصفّح إلى إزالة أدواتك المحفوظة.')}</p><p>${ui(lang, 'Activities completed:', 'الأنشطة المكتملة:')} <strong data-kids-completed-count>0</strong></p>${full ? `<div class="kids-toolkit-columns"><section class="kids-panel"><h3>${ui(lang, 'Saved for another day', 'محفوظة ليوم آخر')}</h3><div data-kids-saved-list></div></section><section class="kids-panel"><h3>${ui(lang, 'Our week', 'أسبوعنا')}</h3><div data-kids-planner></div></section></div><div class="kids-actions"><button class="kids-button" type="button" data-kids-print-plan>${ui(lang, 'Print our week', 'اطبع أسبوعنا')}</button><button class="kids-button secondary" type="button" data-kids-reset-toolkit>${ui(lang, 'Clear this device’s toolkit', 'امسح أدوات هذا الجهاز')}</button></div>` : `<a class="kids-button" href="${kidsPath(lang,'toolkit')}">${ui(lang, 'Open saved activities & planner', 'افتح الأنشطة المحفوظة والمخطّط')}</a>`}<noscript><p>${ui(lang, 'Your toolkit needs JavaScript. All activity instructions and printable packs can still be read.', 'تحتاج أدوات الأسرة إلى تشغيل جافاسكريبت. تبقى تعليمات الأنشطة والحزم القابلة للطباعة متاحة للقراءة.')}</p></noscript></section>`;
}
function hub(content, lang, {age, area, listing = false} = {}) {
  const title = age ? `${loc(age.title,lang)} · ${ageText(age.id,lang)}` : area ? loc(area.title,lang) : listing ? ui(lang,'All kids activities','جميع أنشطة الأطفال') : ui(lang,'Kids Learning & Play','عالم الأطفال: تعلّم والعب');
  const description = age ? loc(age.description,lang) : area ? loc(area.description,lang) : ui(lang,`Explore ${content.activities.length} questions and playful activities: ${KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AGES.length} in each learning area. Find printable packs and easy weekly plans for your family.`, `استكشف ${content.activities.length} سؤالًا ونشاطًا مرحًا: ${KIDS_INVENTORY.activitiesPerAgeAndArea * KIDS_AGES.length} في كلّ مجال تعلّم. اكتشف حزمًا للطباعة وخططًا أسبوعية سهلة لأسرتك.`);
  const filtered = content.activities.filter(a => (!age || a.age === age.id) && (!area || a.area === area.id));
  const main = !age && !area && !listing;
  const plans = main ? KIDS_AGES.map(a => content.plans.find(p => p.age === a.id)) : content.plans.filter(p => !age || p.age === age.id);
  const packs = main ? KIDS_AGES.map((a, i) => content.packs.find(p => p.age === a.id && p.area === KIDS_AREAS[i].id)) : content.packs.filter(p => (!age || p.age === age.id) && (!area || p.area === area.id));
  return layout({lang, suffix: age ? `ages/${age.id}` : area ? `areas/${area.id}` : listing ? 'activities' : '', title, description, content:
    hero(lang,title,description,{image:area?.image}) + `<nav class="kids-subnav" aria-label="${ui(lang,'Explore kids learning','استكشف تعلّم الأطفال')}">${[['activities',ui(lang,'Activities','الأنشطة')],['weekly-plans',ui(lang,'Weekly plans','خطط أسبوعية')],['printables',ui(lang,'Printables','للطباعة')],['parents',ui(lang,'For parents','للأهل')],['toolkit',ui(lang,'My toolkit','أدواتي')]].map(([id,text])=>`<a href="${kidsPath(lang,id)}">${text}</a>`).join('')}</nav>` + finder(lang,{age:age?.id,area:area?.id}) +
    (main ? `<section class="kids-section">${sectionHead(ui(lang,'A starting point for every stage','بداية مناسبة لكلّ مرحلة'),ui(lang,'Age is a guide. Explore nearby ages and use the easier or harder variations.', 'العمر دليل أولي. استكشف الأعمار القريبة واستخدم النسخة الأسهل أو الأصعب.'))}${ageCards(lang)}</section><section class="kids-section">${sectionHead(ui(lang,'Follow their curiosity','اتبع فضولهم'))}${areaCards(lang)}</section>` : '') + library(filtered,lang) +
    resourcesSection(plans,lang,'weekly-plans',ui(lang,'A playful week, ready for you','أسبوع مرح جاهز لكم'),ui(lang,'Five small invitations to explore. No daily pressure.','خمس دعوات صغيرة للاستكشاف، دون ضغط يومي.'),main?4:2) +
    resourcesSection(packs,lang,'printables',ui(lang,'Print, play & take it offline','اطبع والعب بعيدًا عن الشاشة'),ui(lang,'24 packs with instructions and parent answer guides. Every activity also works without a printer.','24 حزمة مع تعليمات وأدلة إجابات للأهل. ويمكن تنفيذ كلّ نشاط دون طابعة.'),main?4:2) +
    (main?resourcesSection(content.guides,lang,'parents',ui(lang,'A helping hand for parents','دعم عملي للأهل'),ui(lang,'Simple ways to support the thinking, without taking over.','طرق بسيطة لدعم التفكير دون أداء المهمّة عن الطفل.'),4):'') + toolkit(lang,main) +
    `<p class="kids-note"><a href="${kidsPath(lang,'riddles')}">${ui(lang,'Looking for the original 30 kids riddles? Find them here, now with explanations.','تبحث عن ألغاز الأطفال الثلاثين الأصلية؟ تجدها هنا مع شروح للإجابات.')}</a></p>` });
}
function dayPicker(a,lang) {
  const days = [pair('Monday','الاثنين'),pair('Tuesday','الثلاثاء'),pair('Wednesday','الأربعاء'),pair('Thursday','الخميس'),pair('Friday','الجمعة'),pair('Saturday','السبت'),pair('Sunday','الأحد')];
  return `<label><span>${ui(lang,'Plan for','خطّط ليوم')}</span><select data-kids-day="${a.id}">${days.map((d,i)=>`<option value="${['mon','tue','wed','thu','fri','sat','sun'][i]}">${loc(d,lang)}</option>`).join('')}</select></label><button class="kids-button secondary" type="button" data-kids-add="${a.id}">${ui(lang,'Add to our week','أضف إلى أسبوعنا')}</button>`;
}
function activityPage(a,content,lang) {
  const title=loc(a.title,lang),description=loc(a.summary,lang),area=KIDS_AREAS.find(v=>v.id===a.area);
  const group=content.activities.filter(v=>v.age===a.age&&v.area===a.area),next=group[(group.findIndex(v=>v.id===a.id)+1)%group.length];
  const block=(title,body,cls='')=>`<section class="kids-detail-section ${cls}"><h2>${e(title)}</h2>${body}</section>`;
  const paragraph=field=>`<p>${e(loc(a[field],lang))}</p>`;
  const steps=loc(a.steps,lang);
  return layout({lang,suffix:`activities/${a.id}`,title,description,type:'activity',activity:a,schema:{'@type':'LearningResource',name:title,description,educationalLevel:ageText(a.age,lang),learningResourceType:loc(formats[a.format],lang),timeRequired:`PT${a.minutes}M`,teaches:loc(a.objective,lang)},content:
    `<header class="kids-section"><p class="kids-eyebrow">${ageText(a.age,lang)} · ${e(loc(area.title,lang))}</p><h1>${e(title)}</h1><p class="kids-lead">${e(description)}</p><div class="kids-card-meta"><span class="kids-tag">${timeText(a.minutes,lang)}</span><span>${e(loc(reading[a.reading],lang))}</span><span>${e(loc(adults[a.adult],lang))}</span></div><div class="kids-actions"><button class="kids-button" type="button" data-kids-play-together aria-pressed="false">${ui(lang,'Play together','نلعب معًا')}</button><button class="kids-button secondary" type="button" data-kids-speak data-kids-read-target="activity-instructions">${ui(lang,'Read instructions aloud','اقرأ التعليمات بصوت مسموع')}</button><button class="kids-button secondary" type="button" data-kids-stop-speech>${ui(lang,'Stop reading','أوقف القراءة')}</button></div></header>
    <div class="kids-detail-layout"><article class="kids-activity-body" data-kids-read id="activity-instructions">${block(ui(lang,'What we’re practising','ما الذي نتدرّب عليه؟'),paragraph('objective'),'kids-callout')}${block(ui(lang,'Before you begin','قبل أن تبدأ'),paragraph('preparation'))}${block(ui(lang,'Let’s try it','لنجرّب'),list(steps,'ol','kids-steps'))}${block(ui(lang,'Talk about it','نتحدّث عن الفكرة'),paragraph('prompt'),'kids-prompt')}<details class="kids-detail-section"><summary>${ui(lang,'A little hint','تلميح صغير')}</summary>${list(loc(a.hints,lang))}</details><details class="kids-detail-section kids-answer"><summary>${ui(lang,'Answer & what to notice','الإجابة وما نلاحظه')}</summary>${paragraph('answer')}${paragraph('explanation')}</details>${block(ui(lang,'Make it easier','لنجعله أسهل'),paragraph('easier'))}${block(ui(lang,'Take it further','لنتعمّق أكثر'),paragraph('harder'))}${block(ui(lang,'Away from the screen','بعيدًا عن الشاشة'),paragraph('extension'))}</article>
    <aside class="kids-activity-sidebar"><section class="kids-panel"><h2>${ui(lang,'What you’ll need','ما تحتاج إليه')}</h2>${list(loc(a.materials,lang))}<h3>${ui(lang,'Use what you have','استخدم ما لديك')}</h3>${paragraph('alternatives')}<h3>${ui(lang,'Grown-up note','ملاحظة للبالغ')}</h3>${paragraph('supervision')}</section><section class="kids-panel"><h2>${ui(lang,'Keep this activity','احتفظ بهذا النشاط')}</h2><div class="kids-actions"><button class="kids-button secondary" type="button" data-kids-save="${a.id}" aria-pressed="false">${ui(lang,'Save activity','احفظ النشاط')}</button><button class="kids-button secondary" type="button" data-kids-complete="${a.id}" aria-pressed="false">${ui(lang,'Mark completed','ضع علامة مكتمل')}</button>${dayPicker(a,lang)}<a class="kids-button secondary" href="${kidsPath(lang,`printables/pack-${a.age}-${a.area}`)}">${ui(lang,'Open printable pack','افتح حزمة الطباعة')}</a><a href="${kidsPath(lang,'toolkit')}">${ui(lang,'Open our planner','افتح مخطّطنا')}</a></div></section></aside></div><section class="kids-section">${sectionHead(ui(lang,'Another small discovery','اكتشاف صغير آخر'))}<div class="kids-card-grid">${activityCard(next,lang)}</div></section>`});
}
function indexPage(content,lang,kind) {
  const items = kind === 'printables' ? content.packs : kind === 'weekly-plans' ? content.plans : content.guides;
  const title = ui(lang,{printables:'Printable activity packs','weekly-plans':'A playful week, ready to use',parents:'A helping hand for parents'}[kind],{printables:'حزم أنشطة قابلة للطباعة','weekly-plans':'أسبوع مرح جاهز للاستخدام',parents:'دعم عملي للأهل'}[kind]);
  const description = ui(lang,{printables:'Choose an age and learning area. Each free pack brings twenty complete activities and a separate answer guide together.','weekly-plans':'Choose one of four weeks for your child’s age. Add five activities to your planner, then move, repeat or skip any day.',parents:'Eight practical guides for choosing activities, sharing languages, supporting ideas and making play work for your family.'}[kind],{printables:'اختر العمر ومجال التعلّم. تجمع كلّ حزمة مجانية عشرين نشاطًا كاملًا ودليل إجابات منفصلًا.','weekly-plans':'اختر أحد أربعة أسابيع لعمر طفلك. أضف خمسة أنشطة إلى المخطّط، ثم غيّر الأيام أو كرّر النشاط أو تجاوزه.',parents:'ثمانية أدلّة عملية لاختيار الأنشطة ومشاركة اللغات ودعم الأفكار وتكييف اللّعب مع أسرتك.'}[kind]);
  return layout({lang,suffix:kind,title,description,type:'resources',content:hero(lang,title,description,{action:false}) + (kind==='parents'?`<div class="kids-resource-grid kids-section">${items.map(item=>resourceCard(item,lang,kind)).join('')}</div>`:content.ages.map(age=>`<section class="kids-section">${sectionHead(`${ageText(age.id,lang)} · ${loc(age.title,lang)}`)}<div class="kids-resource-grid">${items.filter(v=>v.age===age.id).map(item=>resourceCard(item,lang,kind)).join('')}</div></section>`).join(''))});
}
function planPage(plan,content,lang) {
  const activities=plan.activityIds.map(id=>content.activities.find(a=>a.id===id));
  return layout({lang,suffix:`weekly-plans/${plan.id}`,title:loc(plan.title,lang),description:loc(plan.description,lang),type:'plan',content:hero(lang,loc(plan.title,lang),loc(plan.description,lang),{action:false})+`<section class="kids-section kids-callout"><p>${ui(lang,`About ${activities.reduce((n,a)=>n+a.minutes,0)} minutes across the week. Each activity can stand alone. Adding a week keeps anything already in your planner.`,`نحو ${activities.reduce((n,a)=>n+a.minutes,0)} دقيقة موزّعة على الأسبوع. يمكن تنفيذ كلّ نشاط منفردًا. تبقى الأنشطة الموجودة في مخطّطك عند إضافة الأسبوع.`)}</p><div class="kids-actions"><button class="kids-button" type="button" data-kids-load-plan="${plan.id}">${ui(lang,'Add this week to our planner','أضف الأسبوع إلى مخطّطنا')}</button><a class="kids-button secondary" href="${kidsPath(lang,'toolkit')}">${ui(lang,'Open our planner','افتح مخطّطنا')}</a></div></section><section class="kids-section"><div class="kids-card-grid">${activities.map(a=>activityCard(a,lang)).join('')}</div></section>`});
}
function packPage(pack,content,lang) {
  const activities=pack.activityIds.map(id=>content.activities.find(a=>a.id===id));
  return layout({lang,suffix:`printables/${pack.id}`,title:loc(pack.title,lang),description:loc(pack.description,lang),type:'pack',content:hero(lang,loc(pack.title,lang),loc(pack.description,lang),{action:false})+`<section class="kids-section kids-callout"><h2>${ui(lang,'Ready to print','جاهزة للطباعة')}</h2><p>${ui(lang,'Each pack has twenty activity sheets plus a separate parent answer guide. Print only the pages you need. Choose your paper size for a clean fit, or open the activities below without printing.','تضمّ كلّ حزمة عشرين ورقة أنشطة ودليل إجابات منفصلًا للأهل. اطبع الصفحات التي تحتاجها فقط، واختر حجم الورق المناسب، أو افتح الأنشطة أدناه دون طباعة.')}</p><div class="kids-actions">${['a4','letter'].map(size=>`<a class="kids-button${size==='letter'?' secondary':''}" href="/assets/kids/printables/${pack.id}-${lang}-${size}.pdf" download>${ui(lang,`Download ${size.toUpperCase()} PDF`,`تنزيل PDF بحجم ${size.toUpperCase()}`)}</a>`).join('')}</div></section><section class="kids-section">${sectionHead(ui(lang,'Read and play without a printer','اقرأ والعب دون طابعة'))}<div class="kids-card-grid">${activities.map(a=>activityCard(a,lang)).join('')}</div></section>`});
}
function guidePage(guide,lang) {
  return layout({lang,suffix:`parents/${guide.id}`,title:loc(guide.title,lang),description:loc(guide.description,lang),type:'guide',schema:{'@type':'Article',headline:loc(guide.title,lang),description:loc(guide.description,lang)},content:hero(lang,loc(guide.title,lang),loc(guide.description,lang),{action:false})+`<article class="kids-section kids-guide-content" data-kids-read>${guide.sections.map(s=>`<section class="kids-detail-section"><h2>${e(loc(s.title,lang))}</h2><p>${e(loc(s.body,lang))}</p></section>`).join('')}<div class="kids-callout"><h2>${ui(lang,'Try one small thing today','جرّب شيئًا صغيرًا اليوم')}</h2><p>${ui(lang,'Choose one idea from this guide and one activity your child is curious about. Adapt it together, and keep what works for your family.','اختر فكرة واحدة من الدليل ونشاطًا يثير فضول طفلك. كيّفاه معًا واحتفظا بما يناسب أسرتكما.')}</p><a class="kids-button" href="${kidsPath(lang,'activities')}">${ui(lang,'Find an activity','ابحث عن نشاط')}</a></div></article>`});
}
function legacyPage(content,lang) {
  return layout({lang,suffix:'riddles',title:ui(lang,'The original kids riddles','ألغاز الأطفال الأصلية'),description:ui(lang,'Thirty familiar riddles, now with age guidance and explanations. Read a clue together and talk about why an answer fits.','ثلاثون لغزًا مألوفًا مع إرشادات عمرية وشروح. اقرأ القرينة مع طفلك وناقشا سبب ملاءمة الإجابة.'),type:'riddles',content:hero(lang,ui(lang,'Thirty little mysteries','ثلاثون لغزًا صغيرًا'),ui(lang,'Read together. Think aloud. Find the clue that makes it click.','اقرآ معًا وفكّرا بصوت مسموع، وابحثا عن القرينة التي توضّح الفكرة.'),{action:false})+`<section class="kids-section"><div class="kids-card-grid">${content.legacy.map(c=>`<article class="kids-activity-card" id="${c.id}"><p class="kids-eyebrow">${ageText(c.age,lang)}</p><h2 tabindex="-1">${e(loc(c.question,lang))}</h2><details class="kids-answer"><summary>${ui(lang,'Answer & explanation','الإجابة والشرح')}</summary><p><strong>${e(loc(c.answer,lang))}</strong></p><p>${e(loc(c.explanation,lang))}</p></details><p class="kids-note">${ui(lang,'Which clue helped you? Can you invent another clue?','أيّ قرينة ساعدتك؟ هل تستطيع ابتكار قرينة أخرى؟')}</p><a href="${kidsPath(lang,`ages/${c.age}`)}">${ui(lang,'Explore activities for this age','استكشف أنشطة هذا العمر')}</a></article>`).join('')}</div></section>`});
}
export function generateKidsPages({check=false}={}) {
  const content=loadKidsContent(), outputs=new Map(), stale=[];
  const emit=(route,body)=>outputs.set(route==='/kids-riddles'?'kids-riddles.html':`${route.slice(1)}index.html`,body);
  for (const lang of ['en','ar']) {
    emit(kidsBase(lang),hub(content,lang));
    emit(kidsPath(lang,'activities'),hub(content,lang,{listing:true}));
    for (const age of content.ages) emit(kidsPath(lang,`ages/${age.id}`),hub(content,lang,{age}));
    for (const area of content.areas) emit(kidsPath(lang,`areas/${area.id}`),hub(content,lang,{area}));
    for (const a of content.activities) emit(activityPath(lang,a.id),activityPage(a,content,lang));
    for (const kind of ['printables','weekly-plans','parents']) emit(kidsPath(lang,kind),indexPage(content,lang,kind));
    for (const p of content.plans) emit(kidsPath(lang,`weekly-plans/${p.id}`),planPage(p,content,lang));
    for (const p of content.packs) emit(kidsPath(lang,`printables/${p.id}`),packPage(p,content,lang));
    for (const g of content.guides) emit(kidsPath(lang,`parents/${g.id}`),guidePage(g,lang));
    emit(kidsPath(lang,'toolkit'),layout({lang,suffix:'toolkit',title:ui(lang,'Our family toolkit','أدوات أسرتنا'),description:ui(lang,'Saved activities, a flexible weekly planner and a record of what you tried on this device.','أنشطة محفوظة ومخطّط أسبوعي مرن وسجلّ لما جرّبتموه على هذا الجهاز.'),type:'toolkit',content:`<h1>${ui(lang,'Our family toolkit','أدوات أسرتنا')}</h1>`+toolkit(lang)}));
    emit(kidsPath(lang,'riddles'),legacyPage(content,lang));
  }
  const catalog={schemaVersion:1,activities:content.activities.map(a=>Object.fromEntries(['id','age','area','format','minutes','materialGroup','reading','adult','screenFree','title','summary'].map(k=>[k,a[k]]))),ages:content.ages,areas:content.areas,plans:content.plans,packs:content.packs,guides:content.guides.map(({sections,...g})=>g),legacy:content.legacy};
  outputs.set('data/kids/catalog.json',JSON.stringify(catalog,null,2)+'\n');
  for (const [relative,body] of outputs) {
    const file=path.join(root,relative);
    if (fs.existsSync(file)&&fs.readFileSync(file,'utf8')===body) continue;
    stale.push(relative);
    if (!check) { fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body); }
  }
  if (check&&stale.length) throw Error(`Stale kids outputs (${stale.length}): ${stale.slice(0,8).join(', ')}`);
  console.log(`${check?'Verified':'Generated'} kids learning: ${outputs.size-1} pages, ${content.activities.length} activities, ${content.packs.length} packs, ${content.plans.length} weeks, ${content.guides.length} guides, ${content.legacy.length} preserved riddles.`);
  return {content,outputs};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateKidsPages({check:process.argv.includes('--check')});
