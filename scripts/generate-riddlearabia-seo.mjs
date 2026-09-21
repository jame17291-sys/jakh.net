#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRIMARY_SITE_ORIGIN,
  rewritePublicSiteIdentity,
} from "./public-site-identity.mjs";
import {
  RETIRED_LEGACY_SEO_DIRECTORIES,
  PRESERVED_GAME_SLUGS,
  RIDDLE_ARABIA_GAME_CATALOG,
  RIDDLE_ARABIA_SEO_PAGES,
} from "./riddlearabia-seo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const SITE_ORIGIN = PRIMARY_SITE_ORIGIN;
const LAST_MODIFIED = "2026-09-11";
const ASSET_VERSION = "2026091102";
const APP_ASSET_VERSION = "2026080201";
const PRIVACY_ASSET_VERSION = "2026080101";
const SOCIAL_IMAGE_PATH = "assets/riddlearabia-og-image.png";
const LOGO_PATH = "assets/riddlearabia-logo.webp";
const outputs = new Map();
const stale = [];

const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/catalog.json"), "utf8"));
const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
const sectionBySlug = new Map();
for (const section of catalog.sections || []) {
  for (const slug of section.members || []) sectionBySlug.set(slug, section);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function emit(relativePath, content) {
  const normalized = rewritePublicSiteIdentity(content.endsWith("\n") ? content : `${content}\n`);
  outputs.set(relativePath, normalized);
}

function jsonLd(value) {
  return JSON.stringify(value, null, 2).replaceAll("</", "<\\/");
}

function rasterDimensions(buffer) {
  if (
    buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { type: "image/png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (
    buffer.length >= 30
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    const format = buffer.toString("ascii", 12, 16);
    if (format === "VP8 ") {
      return {
        type: "image/webp",
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (format === "VP8X") {
      return {
        type: "image/webp",
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (format === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return {
        type: "image/webp",
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
      };
    }
  }
  return null;
}

function socialImage() {
  const absolute = path.join(root, SOCIAL_IMAGE_PATH);
  if (!fs.existsSync(absolute)) throw new Error(`Missing Riddle Arabia social image: ${SOCIAL_IMAGE_PATH}`);
  const dimensions = rasterDimensions(fs.readFileSync(absolute));
  if (!dimensions?.width || !dimensions?.height) throw new Error(`Unreadable social image: ${SOCIAL_IMAGE_PATH}`);
  return {
    url: `${SITE_ORIGIN}/${SOCIAL_IMAGE_PATH}`,
    ...dimensions,
  };
}

const SOCIAL_IMAGE = socialImage();

function socialMeta({ title, description, canonical, lang }) {
  const imageAlt = lang === "ar"
    ? "ريـدل أرابيا — ألغاز واختبارات وألعاب دماغ بالعربية والإنجليزية"
    : "Riddle Arabia — bilingual riddles, quizzes, and brain games";
  return `    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:locale" content="${lang === "ar" ? "ar_AE" : "en_US"}" />
    <meta property="og:site_name" content="Riddle Arabia" />
    <meta property="og:image" content="${SOCIAL_IMAGE.url}" />
    <meta property="og:image:type" content="${SOCIAL_IMAGE.type}" />
    <meta property="og:image:width" content="${SOCIAL_IMAGE.width}" />
    <meta property="og:image:height" content="${SOCIAL_IMAGE.height}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SOCIAL_IMAGE.url}" />
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />`;
}

function languageAlternates(enPath, arPath) {
  const en = `${SITE_ORIGIN}${enPath}`;
  const ar = `${SITE_ORIGIN}${arPath}`;
  return `    <link rel="alternate" hreflang="en" href="${en}" />
    <link rel="alternate" hreflang="ar" href="${ar}" />
    <link rel="alternate" hreflang="x-default" href="${en}" />`;
}

function localizedPath(page, lang) {
  return page.paths[lang];
}

function logoMarkup(lang, href) {
  const label = lang === "ar" ? "الصفحة الرئيسية لريـدل أرابيا" : "Riddle Arabia home";
  return `<a href="${href}" class="brand" aria-label="${label}">
        <img src="/${LOGO_PATH}" alt="Riddle Arabia" class="brand-logo" width="1536" height="1024" loading="eager" fetchpriority="high" />
      </a>`;
}

function globalHeader(lang, alternate) {
  const isAr = lang === "ar";
  const home = isAr ? "/ar/" : "/";
  const collections = isAr ? "/ar/collections/" : "/collections";
  const games = isAr ? "/ar/alab-al-dimagh/" : "/brain-games";
  return `<header class="site-header shell">
      ${logoMarkup(lang, home)}
      <nav class="header-actions" aria-label="${isAr ? "التنقل الرئيسي" : "Primary navigation"}">
        <a class="ghost-btn" href="${home}">${isAr ? "الرئيسية" : "Home"}</a>
        <a class="ghost-btn" href="${collections}">${isAr ? "استكشف" : "Explore"}</a>
        <a class="ghost-btn" href="${games}">${isAr ? "الألعاب" : "Games"}</a>
        <a class="ghost-btn language-route-link" href="${alternate}" hreflang="${isAr ? "en" : "ar"}" lang="${isAr ? "en" : "ar"}" dir="${isAr ? "ltr" : "rtl"}">${isAr ? "English" : "العربية"}</a>
      </nav>
    </header>`;
}

function globalFooter(lang) {
  const isAr = lang === "ar";
  return `<footer class="site-footer shell">
      <div class="footer-inner">
        <p class="footer-copy">${isAr ? "© 2026 ريـدل أرابيا" : "© 2026 Riddle Arabia"}</p>
        <nav class="footer-site-links" aria-label="${isAr ? "معلومات ريـدل أرابيا" : "Riddle Arabia information"}">
          <a href="${isAr ? "/ar/collections/" : "/collections"}">${isAr ? "المسارات" : "Collections"}</a>
          <a href="${isAr ? "/ar/alab-al-dimagh/" : "/brain-games"}">${isAr ? "ألعاب الدماغ" : "Brain games"}</a>
          <a href="${isAr ? "/ar/about/" : "/about"}">${isAr ? "عن الموقع" : "About"}</a>
          <a href="${isAr ? "/ar/privacy/" : "/privacy"}">${isAr ? "الخصوصية" : "Privacy"}</a>
        </nav>
      </div>
    </footer>`;
}

function analyticsHead() {
  return `    <script defer src="/privacy-consent.js?v=${PRIVACY_ASSET_VERSION}"></script>`;
}

function head({ title, description, canonical, enPath, arPath, lang, robots = "index,follow,max-image-preview:large", structured }) {
  return `<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${canonical}" />
${languageAlternates(enPath, arPath)}
    <meta name="robots" content="${robots}" />
${socialMeta({ title, description, canonical, lang })}
    <script type="application/ld+json">
${jsonLd(structured)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
    <link rel="manifest" href="/manifest.webmanifest" />
${analyticsHead()}
  </head>`;
}

const cardsBySlug = new Map();
function loadCard(slug, id) {
  if (!cardsBySlug.has(slug)) {
    const dataPath = path.join(root, "data", `${slug}.json`);
    if (!fs.existsSync(dataPath)) throw new Error(`SEO page references missing source category ${slug}`);
    cardsBySlug.set(slug, JSON.parse(fs.readFileSync(dataPath, "utf8")));
  }
  const card = cardsBySlug.get(slug).find((candidate) => candidate.id === id);
  if (!card) throw new Error(`SEO page references missing card ${slug}/${id}`);
  if (!cleanText(card.question?.en) || !cleanText(card.question?.ar) || !cleanText(card.answer?.en) || !cleanText(card.answer?.ar)) {
    throw new Error(`SEO page references incomplete bilingual card ${slug}/${id}`);
  }
  const category = categoryBySlug.get(slug);
  if (!category) throw new Error(`SEO page references unknown category metadata ${slug}`);
  return { ...card, sourceCategory: category };
}

function loadPageCards(page) {
  if (page.kind === "games") return [];
  const results = page.cards.map(([slug, id]) => loadCard(slug, id));
  const ids = results.map((card) => card.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${page.key} repeats a card`);
  return results;
}

function quizStructuredData(page, cards, lang, canonical) {
  const subjects = page.subjects[lang].map((name) => ({ "@type": "Thing", name }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Quiz",
        "@id": `${canonical}#quiz`,
        name: page.headings[lang],
        description: page.descriptions[lang],
        url: canonical,
        inLanguage: lang,
        isAccessibleForFree: true,
        provider: {
          "@type": "Organization",
          name: "Riddle Arabia",
          url: `${SITE_ORIGIN}/`,
          logo: `${SITE_ORIGIN}/${LOGO_PATH}`,
        },
        about: subjects,
        educationalAlignment: page.subjects[lang].map((targetName) => ({
          "@type": "AlignmentObject",
          alignmentType: "educationalSubject",
          targetName,
        })),
        hasPart: cards.map((card) => ({
          "@type": "Question",
          "@id": `${canonical}#${encodeURIComponent(card.id)}`,
          eduQuestionType: "Flashcard",
          text: card.question[lang],
          acceptedAnswer: { "@type": "Answer", text: card.answer[lang] },
        })),
      },
      breadcrumbStructuredData(page, lang, canonical),
    ],
  };
}

function breadcrumbStructuredData(page, lang, canonical) {
  const isAr = lang === "ar";
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: isAr ? "الرئيسية" : "Home",
        item: `${SITE_ORIGIN}${isAr ? "/ar/" : "/"}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: isAr ? "استكشف" : "Explore",
        item: `${SITE_ORIGIN}${isAr ? "/ar/collections/" : "/collections"}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: page.headings[lang],
        item: canonical,
      },
    ],
  };
}

function answerCardMarkup(card, index, lang) {
  const isAr = lang === "ar";
  const cardPath = isAr ? `/ar/topics/${card.sourceCategory.slug}/?card=${encodeURIComponent(card.id)}` : `/${card.sourceCategory.slug}?card=${encodeURIComponent(card.id)}`;
  const categoryName = card.sourceCategory.title[lang] || card.sourceCategory.title.en;
  return `<article class="seo-qa-card" id="${escapeHtml(card.id)}" data-card-id="${escapeHtml(card.id)}">
          <details>
            <summary><span class="seo-question-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(card.question[lang])}</span></summary>
            <div class="seo-answer">
              <p class="seo-answer-label">${isAr ? "الحل" : "Answer"}</p>
              <p>${escapeHtml(card.answer[lang])}</p>
              <a class="text-btn" href="${cardPath}">${isAr ? `استكشف موضوع ${escapeHtml(categoryName)} ←` : `Explore ${escapeHtml(categoryName)} →`}</a>
            </div>
          </details>
        </article>`;
}

function relatedExperienceMarkup(page, lang) {
  const isAr = lang === "ar";
  const alternatives = RIDDLE_ARABIA_SEO_PAGES
    .filter((candidate) => candidate.key !== page.key)
    .slice(0, 3);
  return `<section class="shell section-block" aria-labelledby="next-title">
        <div class="section-heading library-head">
          <div>
            <p class="eyebrow">${isAr ? "واصل الاستكشاف" : "Keep exploring"}</p>
            <h2 id="next-title">${isAr ? "تحديات أخرى قد تعجبك" : "More ways to challenge yourself"}</h2>
          </div>
        </div>
        <div class="seo-hub-grid">
          ${alternatives.map((candidate) => `<article class="seo-hub-card">
            <h3>${escapeHtml(candidate.headings[lang])}</h3>
            <p>${escapeHtml(candidate.descriptions[lang])}</p>
            <a class="ghost-btn" href="${localizedPath(candidate, lang)}">${isAr ? "ابدأ" : "Start"}</a>
          </article>`).join("\n          ")}
        </div>
      </section>`;
}

function renderQuizExperience(page, lang, cards) {
  const isAr = lang === "ar";
  const enPath = localizedPath(page, "en");
  const arPath = localizedPath(page, "ar");
  const canonical = `${SITE_ORIGIN}${localizedPath(page, lang)}`;
  const alternate = localizedPath(page, isAr ? "en" : "ar");
  const structured = quizStructuredData(page, cards, lang, canonical);
  const disclaimer = page.disclaimer
    ? `\n        <aside class="collection-disclaimer" role="note">${escapeHtml(page.disclaimer[lang])}</aside>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  ${head({
    title: page.titles[lang],
    description: page.descriptions[lang],
    canonical,
    enPath,
    arPath,
    lang,
    structured,
  })}
  <body class="seo-page riddlearabia-experience" data-seo-experience="${page.key}">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    ${globalHeader(lang, alternate)}
    <main id="content">
      <section class="seo-collection-hero shell">
        <p class="eyebrow">${escapeHtml(page.eyebrow[lang])}</p>
        <h1>${escapeHtml(page.headings[lang])}</h1>
        <p>${escapeHtml(page.introductions[lang])}</p>
        <div class="seo-collection-meta">
          <span>${cards.length} ${isAr ? "ألغاز" : "riddles"}</span>
          <span>${isAr ? "العربية والإنجليزية" : "Arabic & English"}</span>
          <span>${isAr ? "مجاني" : "Free"}</span>
        </div>${disclaimer}
      </section>
      <section class="shell section-block" aria-labelledby="how-title">
        <div class="section-heading library-head">
          <div><p class="eyebrow">${isAr ? "طريقة اللعب" : "How to play"}</p><h2 id="how-title">${isAr ? "خذ وقتك مع كل تلميح" : "Give each clue a moment"}</h2></div>
          <p class="section-note">${escapeHtml(page.guidance[lang])}</p>
        </div>
      </section>
      <section class="seo-question-list shell" aria-label="${isAr ? "ألغاز وحلول" : "Riddles and answers"}">
        ${cards.map((card, index) => answerCardMarkup(card, index, lang)).join("\n        ")}
      </section>
      ${relatedExperienceMarkup(page, lang)}
    </main>
    ${globalFooter(lang)}
  </body>
</html>`;
}

function gamesStructuredData(page, lang, canonical) {
  const isAr = lang === "ar";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#webpage`,
        name: page.headings[lang],
        description: page.descriptions[lang],
        url: canonical,
        inLanguage: lang,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        mainEntity: { "@id": `${canonical}#games` },
      },
      {
        "@type": "ItemList",
        "@id": `${canonical}#games`,
        name: isAr ? "ألعاب دماغ ريدل أرابيا" : "Riddle Arabia brain games",
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: RIDDLE_ARABIA_GAME_CATALOG.length,
        itemListElement: RIDDLE_ARABIA_GAME_CATALOG.map((game, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "VideoGame",
            name: game.names[lang],
            url: `${SITE_ORIGIN}${isAr ? `/ar/games/${game.slug}/` : `/${game.slug}`}`,
            description: game.descriptions[lang],
            gamePlatform: "Web browser",
            isAccessibleForFree: true,
          },
        })),
      },
      breadcrumbStructuredData(page, lang, canonical),
    ],
  };
}

function renderGamesExperience(page, lang) {
  const isAr = lang === "ar";
  const enPath = localizedPath(page, "en");
  const arPath = localizedPath(page, "ar");
  const canonical = `${SITE_ORIGIN}${localizedPath(page, lang)}`;
  const alternate = localizedPath(page, isAr ? "en" : "ar");
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  ${head({
    title: page.titles[lang],
    description: page.descriptions[lang],
    canonical,
    enPath,
    arPath,
    lang,
    structured: gamesStructuredData(page, lang, canonical),
  })}
  <body class="seo-page riddlearabia-experience" data-seo-experience="${page.key}">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    ${globalHeader(lang, alternate)}
    <main id="content">
      <section class="seo-collection-hero shell">
        <p class="eyebrow">${escapeHtml(page.eyebrow[lang])}</p>
        <h1>${escapeHtml(page.headings[lang])}</h1>
        <p>${escapeHtml(page.introductions[lang])}</p>
        <p class="section-note">${escapeHtml(page.guidance[lang])}</p>
      </section>
      <section class="shell" aria-label="${isAr ? "ابدأ باكشفها" : "Start with Akshifha"}">
        ${RIDDLE_ARABIA_GAME_CATALOG.filter((game) => game.kind === "featured").map((game) => `<article class="seo-hub-card">
          <p class="eyebrow">${isAr ? "ابدأ هنا · نسخة تجريبية مجانية" : "Start here · Free pilot"}</p>
          <h2>${escapeHtml(game.names[lang])}</h2>
          <p>${escapeHtml(game.descriptions[lang])}</p>
          <a class="primary-btn" href="${isAr ? `/ar/games/${game.slug}/` : `/${game.slug}`}">${isAr ? "افتح قضية اليوم" : "Open today’s case"}</a>
        </article>`).join("\n        ")}
      </section>
      <section class="seo-collection-hero shell" aria-labelledby="classics-title">
        <p class="eyebrow">${isAr ? "لوقت أهدأ" : "A quieter change of pace"}</p>
        <h2 id="classics-title">${isAr ? "الكلاسيكيات" : "Classics"}</h2>
        <div class="home-discovery-links">
          ${RIDDLE_ARABIA_GAME_CATALOG.filter((game) => game.kind === "classic").map((game) => `<a href="${isAr ? `/ar/games/${game.slug}/` : `/${game.slug}`}"><span>${escapeHtml(game.names[lang])}</span><small>${escapeHtml(game.descriptions[lang])}</small></a>`).join("\n          ")}
        </div>
      </section>
    </main>
    ${globalFooter(lang)}
  </body>
</html>`;
}

function collectionsStructuredData(lang, canonical) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#webpage`,
        name: lang === "ar" ? "مسارات ريدل أرابيا" : "Riddle Arabia experiences",
        description: lang === "ar"
          ? "مسارات مختارة للألغاز والمعلومات العامة والحنين والألعاب."
          : "Curated paths for riddles, general knowledge, nostalgia, and games.",
        url: canonical,
        inLanguage: lang,
        mainEntity: { "@id": `${canonical}#list` },
      },
      {
        "@type": "ItemList",
        "@id": `${canonical}#list`,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: RIDDLE_ARABIA_SEO_PAGES.length,
        itemListElement: RIDDLE_ARABIA_SEO_PAGES.map((page, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "WebPage",
            "@id": `${SITE_ORIGIN}${page.paths[lang]}`,
            name: page.headings[lang],
            url: `${SITE_ORIGIN}${page.paths[lang]}`,
            inLanguage: lang,
          },
        })),
      },
    ],
  };
}

function renderCollectionsPage(lang) {
  const isAr = lang === "ar";
  const enPath = "/collections";
  const arPath = "/ar/collections/";
  const canonical = `${SITE_ORIGIN}${isAr ? arPath : enPath}`;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  ${head({
    title: isAr ? "اكتشف ألغازاً وألعاباً ذهنية | ريدل أرابيا" : "Discover Riddles & Brain Games | Riddle Arabia",
    description: isAr
      ? "اختر مساراً مناسباً لمزاجك: ألغاز، منطق، معلومات عامة، حنين، أو ألعاب دماغ في المتصفح."
      : "Choose a thoughtful path for your mood: riddles, logic, family play, general knowledge, nostalgia, or browser brain games.",
    canonical,
    enPath,
    arPath,
    lang,
    structured: collectionsStructuredData(lang, canonical),
  })}
  <body class="seo-page riddlearabia-collections" data-seo-experience="collections">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    ${globalHeader(lang, isAr ? enPath : arPath)}
    <main id="content">
      <section class="seo-collection-hero shell">
        <p class="eyebrow">${isAr ? "اختر مزاجك" : "Choose your mood"}</p>
        <h1>${isAr ? "مسارات قصيرة لتفكير ممتع" : "Short paths to satisfying thinking"}</h1>
        <p>${isAr ? "بدلاً من متاهة من الصفحات المتشابهة، تبدأ ريدل أرابيا بمسارات واضحة ومحددة. اختر ما يناسبك الآن، ثم انتقل إلى شيء جديد." : "Instead of a maze of near-identical pages, Riddle Arabia starts with clear, purposeful paths. Choose what fits now, then move to something new."}</p>
      </section>
      <section class="seo-hub-grid shell" aria-label="${isAr ? "مسارات الاستكشاف" : "Explore paths"}">
        ${RIDDLE_ARABIA_SEO_PAGES.map((page) => `<article class="seo-hub-card">
          <p class="eyebrow">${escapeHtml(page.eyebrow[lang])}</p>
          <h2>${escapeHtml(page.headings[lang])}</h2>
          <p>${escapeHtml(page.descriptions[lang])}</p>
          <a class="primary-btn" href="${page.paths[lang]}">${isAr ? "ابدأ" : "Start"}</a>
        </article>`).join("\n        ")}
      </section>
    </main>
    ${globalFooter(lang)}
  </body>
</html>`;
}

function aboutStructuredData(lang, canonical) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${canonical}#webpage`,
    name: lang === "ar" ? "عن ريدل أرابيا" : "About Riddle Arabia",
    description: lang === "ar"
      ? "كيف تصمم ريدل أرابيا مسارات ألغاز واختبارات وألعاب ذهنية ثنائية اللغة."
      : "How Riddle Arabia designs bilingual riddle, quiz, and brain-game experiences.",
    url: canonical,
    inLanguage: lang,
    about: {
      "@type": "Organization",
      name: "Riddle Arabia",
      url: `${SITE_ORIGIN}/`,
      logo: `${SITE_ORIGIN}/${LOGO_PATH}`,
    },
  };
}

function renderAboutPage(lang) {
  const isAr = lang === "ar";
  const enPath = "/about";
  const arPath = "/ar/about/";
  const canonical = `${SITE_ORIGIN}${isAr ? arPath : enPath}`;
  const blocks = isAr
    ? [
      ["ما نصنعه", "ريـدل أرابيا مساحة ثنائية اللغة للألغاز والاختبارات وألعاب الدماغ الخفيفة. نفضّل مسارات واضحة وممتعة على مئات الصفحات التي لا تقدم سبباً حقيقياً للزيارة."],
      ["كيف نختار المحتوى", "نسعى إلى تلميحات مفهومة، وأجوبة محددة، وسياق واضح. تبقى موضوعات الصحة والقانون والمال للتعلّم والترفيه فقط، وليست بديلاً عن مختص."],
      ["اللغتان", "لا نتعامل مع العربية والإنجليزية كزر ترجمة فقط. نبني التجربة بحيث يستطيع القارئ استخدام اللغة التي يفكر بها، أو المقارنة بين اللغتين عند الحاجة."],
      ["التصحيح والتحسين", "إذا صادفت سؤالاً يحتاج تصحيحاً أو توضيحاً، استخدم أدوات الاقتراح داخل مختبر العقل. تساعدنا ملاحظاتك على تحسين التحديثات القادمة."],
    ]
    : [
      ["What we make", "Riddle Arabia is a bilingual home for riddles, quizzes, and light brain games. We prefer clear, enjoyable paths to hundreds of pages with no distinct reason to exist."],
      ["How we choose content", "We aim for understandable clues, specific answers, and useful context. Health, law, and money topics are for learning and entertainment only—not professional advice."],
      ["Two languages by design", "Arabic and English are not treated as a simple translation switch. The experience is built so readers can think in the language that suits them, or compare both when it helps."],
      ["Corrections and improvement", "If you find a question that needs correction or context, use the suggestion tools in the Mind Lab. Feedback helps improve future updates."],
    ];
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  ${head({
    title: isAr ? "عن ريدل أرابيا" : "About Riddle Arabia",
    description: isAr
      ? "تعرّف إلى طريقة ريدل أرابيا في تصميم ألغاز واختبارات وألعاب دماغ ثنائية اللغة."
      : "Learn how Riddle Arabia designs bilingual riddles, quizzes, and brain-game experiences with clarity and care.",
    canonical,
    enPath,
    arPath,
    lang,
    structured: aboutStructuredData(lang, canonical),
  })}
  <body class="seo-page standards-page" data-seo-experience="about">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    ${globalHeader(lang, isAr ? enPath : arPath)}
    <main id="content" class="shell">
      <section class="seo-collection-hero">
        <p class="eyebrow">${isAr ? "عن الموقع" : "About"}</p>
        <h1>${isAr ? "مكان صغير للفضول المشترك" : "A small home for shared curiosity"}</h1>
        <p>${isAr ? "نصمم ريدل أرابيا لتجعل التفكير والمحادثة واللعب جزءاً من وقتك على الإنترنت، بالعربية والإنجليزية." : "Riddle Arabia is designed to make thinking, conversation, and play a better part of your time online—in Arabic and English."}</p>
      </section>
      <section class="standards-grid" aria-label="${isAr ? "معايير ريدل أرابيا" : "Riddle Arabia standards"}">
        ${blocks.map(([title, copy]) => `<article><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></article>`).join("\n        ")}
      </section>
    </main>
    ${globalFooter(lang)}
  </body>
</html>`;
}

function categoryRoute(category, lang) {
  return lang === "ar" ? `/ar/topics/${category.slug}/` : `/${category.slug}`;
}

function renderFunctionalCategoryShell(category, lang) {
  const isAr = lang === "ar";
  const enPath = categoryRoute(category, "en");
  const arPath = categoryRoute(category, "ar");
  const canonical = `${SITE_ORIGIN}${isAr ? arPath : enPath}`;
  const alternate = isAr ? enPath : arPath;
  const section = sectionBySlug.get(category.slug);
  const title = isAr
    ? `${category.title.ar} | ريـدل أرابيا`
    : `${category.title.en} | Riddle Arabia`;
  const description = isAr
    ? `اختبر أسئلة ${category.title.ar} بالعربية والإنجليزية، وتابع تقدّمك داخل ريدل أرابيا.`
    : `Play ${category.title.en} questions in English and Arabic, and track your progress inside Riddle Arabia.`;
  const structured = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    name: title,
    description,
    url: canonical,
    inLanguage: lang,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
  };
  const topicOptions = (category.topics || []).map((topic) => `<button class="category-chip" data-subcategory="${escapeHtml(topic.en)}">${escapeHtml(topic[lang] || topic.en)} · ${topic.count}</button>`).join("\n              ");
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  ${head({
    title,
    description,
    canonical,
    enPath,
    arPath,
    lang,
    robots: "noindex,follow,max-image-preview:large",
    structured,
  })}
  <body data-page="category" data-category="${escapeHtml(category.slug)}" data-route-lang="${lang}">
    <a href="#top" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    <header class="site-header shell">
      ${logoMarkup(lang, isAr ? "/ar/" : "/")}
      <nav class="header-actions" aria-label="${isAr ? "التنقل" : "Quick actions"}">
        <a class="ghost-btn" href="${isAr ? "/ar/" : "/"}">${isAr ? "الرئيسية" : "Home"}</a>
        <a class="ghost-btn" href="${isAr ? "/ar/mind-lab/" : "/mind-lab"}">${isAr ? "مختبر العقل" : "Mind Lab"}</a>
        <a class="ghost-btn language-route-link" href="${alternate}" hreflang="${isAr ? "en" : "ar"}" lang="${isAr ? "en" : "ar"}" dir="${isAr ? "ltr" : "rtl"}">${isAr ? "English" : "العربية"}</a>
        <button class="ghost-btn" id="openAuthBtn">${isAr ? "تسجيل الدخول" : "Sign in"}</button>
      </nav>
      <div class="header-selects" aria-label="${isAr ? "إعدادات اللغة" : "Language controls"}">
        <label><span>${isAr ? "اللغة" : "Language"}</span><select id="langSelect"><option value="en"${isAr ? "" : " selected"}>English</option><option value="ar"${isAr ? " selected" : ""}>العربية</option></select></label>
      </div>
    </header>
    <main id="top">
      <nav class="page-breadcrumb shell" aria-label="${isAr ? "مسار التنقل" : "Breadcrumb"}">
        <a href="${isAr ? "/ar/" : "/"}">${isAr ? "الرئيسية" : "Home"}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <a href="${isAr ? "/ar/mind-lab/" : "/mind-lab"}">${isAr ? "مختبر العقل" : "Mind Lab"}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <span id="breadcrumbCategoryName" aria-current="page">${escapeHtml(category.title[lang])}</span>
      </nav>
      <section class="hero shell hero-category">
        <div class="hero-copy">
          <p class="eyebrow" id="categoryKicker">${escapeHtml(section?.title?.[lang] || category.cluster?.[lang] || "")}</p>
          <h1 id="categoryTitle">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title[lang])}</h1>
          <p class="hero-text" id="categoryDescription">${escapeHtml(category.description?.[lang] || "")}</p>
          <div class="hero-badges"><span id="categoryCountPill">${category.count} ${isAr ? "سؤالاً" : "questions"}</span><span id="categoryDiffBadge"></span></div>
        </div>
        <aside class="hero-panel hero-panel-rich"><img class="hero-illustration" id="categoryImage" alt="" /><div id="categorySummaryMount"></div></aside>
      </section>
      <section class="shell section-block" id="questionSection">
        <div class="section-heading library-head"><div><p class="eyebrow">${isAr ? "العب بطريقتك" : "Play your way"}</p><h2>${isAr ? "استكشف الموضوع" : "Explore this topic"}</h2></div><p class="section-note">${isAr ? "ابحث وصفِّ البطاقات وتابع تقدّمك أثناء اللعب." : "Search, filter cards, and keep track of your progress as you play."}</p></div>
        <section class="control-panel" aria-label="${isAr ? "خيارات الأسئلة" : "Question controls"}">
          <label class="search-field"><span>${isAr ? "ابحث في هذا الموضوع" : "Search this topic"}</span><input id="cardSearchInput" type="search" autocomplete="off" placeholder="${isAr ? "ابحث بكلمة أو إجابة" : "Search by word or answer"}" /></label>
          <div class="select-grid">
            <label><span>${isAr ? "الصعوبة" : "Difficulty"}</span><select id="difficultySelect"><option value="all">${isAr ? "كل المستويات" : "All levels"}</option><option value="easy">${isAr ? "سهل" : "Easy"}</option><option value="medium">${isAr ? "متوسط" : "Medium"}</option><option value="hard">${isAr ? "صعب" : "Hard"}</option><option value="very-advanced">${isAr ? "صعب جداً" : "Very advanced"}</option></select></label>
            <label><span>${isAr ? "إظهار" : "Show"}</span><select id="viewSelect"><option value="all">${isAr ? "الكل" : "Everything"}</option><option value="unsolved">${isAr ? "غير المحلول" : "Unsolved"}</option><option value="solved">${isAr ? "المحلول" : "Solved"}</option><option value="favorites">${isAr ? "المفضلة" : "Favorites"}</option></select></label>
            <label><span>${isAr ? "الترتيب" : "Sort"}</span><select id="sortSelect"><option value="featured">${isAr ? "مقترح" : "Featured"}</option><option value="difficulty">${isAr ? "حسب الصعوبة" : "By difficulty"}</option><option value="az">A → Z</option><option value="random">${isAr ? "عشوائي" : "Shuffle"}</option></select></label>
          </div>
          <div id="subcategoryWrap" class="subcategory-wrap"><p class="mini-label">${isAr ? "الموضوعات الفرعية" : "Subtopics"}</p><div class="chip-row" id="subcategoryFilters"><button class="category-chip is-active" data-subcategory="all">${isAr ? "الكل" : "All"} · ${category.count}</button>${topicOptions}</div></div>
        </section>
        <div class="library-toolbar"><p id="resultsLabel">${isAr ? `عرض ${category.count} بطاقة.` : `Showing ${category.count} cards.`}</p><button class="text-btn" id="resetPageBtn">${isAr ? "إعادة الضبط" : "Reset filters"}</button></div>
        <div id="emptyState" class="empty-state hidden"><strong>${isAr ? "لا توجد بطاقات مطابقة." : "No cards match that choice."}</strong></div>
        <div id="cardGrid" class="riddle-grid" aria-live="polite"></div>
      </section>
      <section class="shell section-block"><div class="section-heading library-head"><div><p class="eyebrow">${isAr ? "واصل" : "Keep going"}</p><h2>${isAr ? "موضوعات قريبة" : "Related topics"}</h2></div></div><div id="relatedCategories" class="category-grid"></div></section>
    </main>
    ${globalFooter(lang)}
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div id="authModal" class="modal hidden" aria-hidden="true"><div class="modal-backdrop" data-close-modal="auth"></div><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle"><div class="modal-head"><h2 id="authModalTitle">${isAr ? "الحساب" : "Account"}</h2><button class="icon-btn" data-close-modal="auth" aria-label="${isAr ? "إغلاق" : "Close"}">×</button></div><div id="authModalBody"></div></div></div>
    <script src="/app.js?v=${APP_ASSET_VERSION}"></script>
  </body>
</html>`;
}

function sitemapUrl(url, priority, alternates) {
  return `  <url>
    <loc>${url}</loc>
    <lastmod>${LAST_MODIFIED}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${alternates.en}"/>
    <xhtml:link rel="alternate" hreflang="ar" href="${alternates.ar}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${alternates.en}"/>
  </url>`;
}

function renderSitemap() {
  const pairs = [
    { en: "/", ar: "/ar/", priority: "1.0" },
    { en: "/mind-lab", ar: "/ar/mind-lab/", priority: "0.85" },
    { en: "/collections", ar: "/ar/collections/", priority: "0.90" },
    { en: "/play", ar: "/ar/play/", priority: "0.75" },
    { en: "/learning", ar: "/ar/learn/", priority: "0.80" },
    { en: "/about", ar: "/ar/about/", priority: "0.50" },
    { en: "/privacy", ar: "/ar/privacy/", priority: "0.35" },
    ...RIDDLE_ARABIA_SEO_PAGES.map((page) => ({ en: page.paths.en, ar: page.paths.ar, priority: page.kind === "games" ? "0.85" : "0.80" })),
    ...RIDDLE_ARABIA_GAME_CATALOG.map((game) => ({ en: `/${game.slug}`, ar: `/ar/games/${game.slug}/`, priority: "0.65" })),
    ...PRESERVED_GAME_SLUGS.map((slug) => ({ en: `/${slug}`, ar: `/ar/games/${slug}/`, priority: "0.35" })),
  ];
  const entries = pairs.flatMap((pair) => {
    const alternates = { en: `${SITE_ORIGIN}${pair.en}`, ar: `${SITE_ORIGIN}${pair.ar}` };
    return [
      sitemapUrl(alternates.en, pair.priority, alternates),
      sitemapUrl(alternates.ar, pair.priority, alternates),
    ];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>`;
}

function desiredOutputs() {
  for (const page of RIDDLE_ARABIA_SEO_PAGES) {
    const cards = loadPageCards(page);
    for (const lang of ["en", "ar"]) {
      const relativePath = lang === "en"
        ? `${page.paths.en.slice(1)}.html`
        : `${page.paths.ar.slice(1)}index.html`;
      emit(
        relativePath,
        page.kind === "games" ? renderGamesExperience(page, lang) : renderQuizExperience(page, lang, cards),
      );
    }
  }
  emit("collections.html", renderCollectionsPage("en"));
  emit("ar/collections/index.html", renderCollectionsPage("ar"));
  emit("about.html", renderAboutPage("en"));
  emit("ar/about/index.html", renderAboutPage("ar"));
  for (const category of categories) {
    emit(`${category.slug}.html`, renderFunctionalCategoryShell(category, "en"));
    emit(`ar/topics/${category.slug}/index.html`, renderFunctionalCategoryShell(category, "ar"));
  }
  emit("sitemap.xml", renderSitemap());
}

function retiredPaths() {
  const paths = [...RETIRED_LEGACY_SEO_DIRECTORIES];
  for (const category of categories) {
    paths.push(`${category.slug}/page`);
    paths.push(`ar/topics/${category.slug}/page`);
  }
  return paths;
}

function removeRetiredOutput(relativePath) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) return;
  if (checkOnly) {
    stale.push(relativePath);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function writeOutputs() {
  for (const [relativePath, content] of outputs) {
    const target = path.join(root, relativePath);
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (current === content) continue;
    if (checkOnly) {
      stale.push(relativePath);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

desiredOutputs();
for (const relativePath of retiredPaths()) removeRetiredOutput(relativePath);
writeOutputs();

if (stale.length) {
  console.error(`Riddle Arabia SEO generation is stale for ${stale.length} file(s):`);
  for (const file of [...new Set(stale)].sort((left, right) => left.localeCompare(right))) console.error(`- ${file}`);
  process.exit(1);
}

console.log(
  `${checkOnly ? "Riddle Arabia SEO generation is current" : "Generated Riddle Arabia SEO"}: `
  + `${RIDDLE_ARABIA_SEO_PAGES.length} original bilingual experience pairs, `
  + `${categories.length * 2} functional noindex topic shells, and a focused sitemap.`,
);
