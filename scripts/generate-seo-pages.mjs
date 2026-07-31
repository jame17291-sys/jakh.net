import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QA_HOLD_IDS, SEO_COLLECTIONS } from "./seo-collections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const SITE_ORIGIN = "https://jakh.net";
const ASSET_VERSION = "2026073103";
const APP_ASSET_VERSION = "2026073103";
const LAST_MODIFIED = "2026-07-31";
const PREVIEW_CARD_COUNT = 20;
const OG_IMAGE_URL = `${SITE_ORIGIN}/assets/og-image.jpg`;
const QA_HOLD_SET = new Set(QA_HOLD_IDS);
const GAME_SLUGS = [
  "chess",
  "mastermind",
  "go",
  "reversi",
  "codenames",
  "catan",
  "backgammon",
  "set",
  "hanabi",
  "diplomacy",
];
const GAME_NAMES = {
  chess: "Chess",
  mastermind: "Mastermind",
  go: "Go",
  reversi: "Reversi",
  codenames: "Codenames",
  catan: "Catan Lite",
  backgammon: "Backgammon",
  set: "SET",
  hanabi: "Hanabi",
  diplomacy: "Diplomacy Lite",
};
const GAME_DESCRIPTIONS = {
  chess: "Play chess online against the computer or a friend in a fast, free browser game with no download required.",
  mastermind: "Crack the four-colour code in ten attempts with this free Mastermind browser game.",
  go: "Play a focused 9×9 game of Go online: capture stones, claim territory, and challenge your strategy.",
  reversi: "Play Reversi online against the computer or a friend in this free disc-flipping strategy game.",
  codenames: "Follow an AI clue giver and uncover the secret agents in this free browser version of Codenames.",
  catan: "Roll dice, collect resources, and build settlements in a compact two-player Catan-inspired strategy game.",
  backgammon: "Roll the dice, move your checkers, and bear them off first in this free online Backgammon game.",
  set: "Race to identify matching sets of three cards in this free pattern-recognition browser game.",
  hanabi: "Work with an AI partner to build a fireworks display in this cooperative Hanabi browser game.",
  diplomacy: "Issue simultaneous orders, control territories, and outthink your opponent in Diplomacy Lite.",
};
const YMYL_SLUGS = new Set([
  "medical-questions",
  "pharmacy",
  "law-middle-east",
  "economics-and-finance",
  "psychology",
]);

const catalogPath = path.join(root, "data", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const categoryBySlug = new Map((catalog.categories || []).map((category) => [category.slug, category]));
const sectionBySlug = new Map();
const outputs = new Map();
const stale = [];

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

function truncate(value, max) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const shortened = text.slice(0, max - 1).replace(/\s+\S*$/u, "");
  return `${shortened || text.slice(0, max - 1)}…`;
}

function emit(relativePath, content) {
  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  outputs.set(relativePath, normalized);
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

function jsonLd(value) {
  return JSON.stringify(value, null, 2).replaceAll("</", "<\\/");
}

function socialMeta({ title, description, url, type = "website", lang = "en" }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const imageAlt = lang === "ar"
    ? "JAKH — 3,553 لغزاً ثنائي اللغة ضمن 56 موضوعاً و10 ألعاب"
    : "JAKH — 3,553 bilingual riddles across 56 topics and 10 games";
  return `    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:image" content="${OG_IMAGE_URL}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${imageAlt}" />
    <meta property="og:site_name" content="JAKH Riddles" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${OG_IMAGE_URL}" />
    <meta name="twitter:image:alt" content="${imageAlt}" />`;
}

function analyticsHead() {
  return `    <script async src="https://www.googletagmanager.com/gtag/js?id=G-VQZQNK6VSV"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-VQZQNK6VSV');
    </script>`;
}

function brandMarkup(lang = "en", dynamic = false, href = "/") {
  const isAr = lang === "ar";
  const i18nAttribute = dynamic ? ' data-i18n-aria-label="brandHomeLabel"' : "";
  return `<a href="${escapeHtml(href)}" class="brand" aria-label="${isAr ? "الصفحة الرئيسية لألغاز JAKH" : "JAKH Riddles home"}"${i18nAttribute}>
        <picture>
          <source srcset="/assets/logo.webp" type="image/webp" />
          <img src="/assets/logo.png" alt="JAKH Riddles" class="brand-logo" width="40" height="40" loading="eager" fetchpriority="high" />
        </picture>
      </a>`;
}

function globalFooter(lang = "en", dynamic = false, languageQuery = "", translationContract = "site") {
  const isAr = lang === "ar";
  const instagramLabel = isAr ? "ألغاز JAKH على إنستغرام" : "JAKH Riddles on Instagram";
  const facebookLabel = isAr ? "ألغاز JAKH على فيسبوك" : "JAKH Riddles on Facebook";
  const instagramKey = translationContract === "app" ? "socialInstagramLabel" : "instagramLabel";
  const facebookKey = translationContract === "app" ? "socialFacebookLabel" : "facebookLabel";
  const instagramI18n = dynamic ? ` data-i18n-aria-label="${instagramKey}"` : "";
  const facebookI18n = dynamic ? ` data-i18n-aria-label="${facebookKey}"` : "";
  return `<footer class="site-footer shell">
      <div class="footer-inner">
        <p class="footer-copy" data-i18n="footerNote">${isAr ? "جميع الحقوق محفوظة لـ JAKH 2026" : "All rights reserved to JAKH 2026"}</p>
        <nav class="footer-site-links" aria-label="${isAr ? "معلومات JAKH" : "JAKH information"}" data-i18n-aria-label="footerInfoLabel">
          <a href="/collections${escapeHtml(languageQuery)}" data-i18n="footerCollections">${isAr ? "المجموعات" : "Collections"}</a>
          <a href="/about${escapeHtml(languageQuery)}" data-i18n="footerAbout">${isAr ? "عن JAKH ومعايير المحتوى" : "About &amp; content standards"}</a>
        </nav>
        <div class="footer-socials">
          <a href="https://www.instagram.com/jakhriddles/" target="_blank" rel="me noopener noreferrer" class="social-link" aria-label="${instagramLabel}"${instagramI18n}><span>Instagram</span></a>
          <a href="https://www.facebook.com/profile.php?id=61588921894305" target="_blank" rel="me noopener noreferrer" class="social-link" aria-label="${facebookLabel}"${facebookI18n}><span>Facebook</span></a>
        </div>
      </div>
    </footer>`;
}

function authModal() {
  return `<div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div id="authModal" class="modal hidden" aria-hidden="true">
      <div class="modal-backdrop" data-close-modal="auth"></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <div class="modal-head">
          <div>
            <p class="eyebrow" data-i18n="authEyebrow">Profile</p>
            <h2 id="authModalTitle" data-i18n="authTitle">Create account or sign in</h2>
          </div>
          <button class="icon-btn" data-close-modal="auth" aria-label="Close">×</button>
        </div>
        <div id="authModalBody"></div>
      </div>
    </div>`;
}

function improveCatalogDescription(category) {
  const currentEn = cleanText(category.description?.en);
  const currentAr = cleanText(category.description?.ar);
  const isGeneric = /^Explore questions about /iu.test(currentEn);
  const isStaleKids = category.slug === "kids-riddles" && /\b300[- ]card\b/iu.test(currentEn);
  if (!isGeneric && !isStaleKids && currentEn && currentAr) return;
  const topicsEn = (category.topics || []).slice(0, 3).map((topic) => topic.en).filter(Boolean);
  const topicsAr = (category.topics || []).slice(0, 3).map((topic) => topic.ar).filter(Boolean);
  category.description = {
    en: `${category.count} bilingual ${category.title.en} questions covering ${topicsEn.join(", ")}${topicsEn.length ? ", and more" : ""}. Switch between English and Arabic, reveal answers, and track your score.`,
    ar: `${category.count} سؤالاً ثنائي اللغة في ${category.title.ar}${topicsAr.length ? ` تشمل ${topicsAr.join("، ")}` : ""}. بدّل بين العربية والإنجليزية، واكشف الإجابات، وتابع نتيجتك.`,
  };
}

for (const category of catalog.categories || []) {
  category.href = `/${category.slug}`;
  improveCatalogDescription(category);
}
emit("data/catalog.json", `${JSON.stringify(catalog, null, 2)}\n`);

function categoryMetaDescription(category) {
  const topic = category.topics?.[0]?.en;
  return truncate(
    `Try ${category.count} ${category.title.en} quiz questions with answers in English and Arabic${topic ? `, covering ${topic} and more` : ""}. Play free and track your score.`,
    158,
  );
}

function staticCardMarkup(category, card) {
  const difficulty = card.difficulty === "very-advanced"
    ? "Very advanced"
    : card.difficulty.charAt(0).toUpperCase() + card.difficulty.slice(1);
  const subcategory = card.subcategory?.en
    ? `<span class="badge badge-subcategory">${escapeHtml(card.subcategory.en)}</span>`
    : "";
  return `<article class="riddle-card" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || category.mode || "quiz")}" aria-label="${escapeHtml(card.question.en)}">
          <div class="card-inner">
            <section class="card-face card-front" aria-hidden="false">
              <div class="card-badges">
                <span class="badge badge-category">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title.en)}</span>
                <span class="badge badge-difficulty" data-difficulty="${escapeHtml(card.difficulty)}">${escapeHtml(difficulty)}</span>
                ${subcategory}
              </div>
              <p class="card-question">${escapeHtml(card.question.en)}</p>
              <div class="card-actions">
                <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}">Flip for the answer</button>
              </div>
            </section>
            <section class="card-face card-back" aria-hidden="true" inert>
              <p class="card-answer"><strong>${escapeHtml(card.answer.en)}</strong></p>
              <div class="card-actions">
                <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}" tabindex="-1">Back to the question</button>
              </div>
            </section>
          </div>
        </article>`;
}

function relatedCategories(category, section) {
  const preferred = [
    ...(category.related || []),
    ...(section?.members || []),
    ...(catalog.categories || []).map((item) => item.slug),
  ];
  return [...new Set(preferred)]
    .filter((slug) => slug !== category.slug && categoryBySlug.has(slug))
    .slice(0, 6)
    .map((slug) => categoryBySlug.get(slug));
}

function categoryImagePath(category) {
  const candidates = [
    category.image,
    `assets/${category.slug}.svg`,
    `assets/backgrounds_new/${category.slug}.jpg`,
    `assets/backgrounds/${category.slug}.png`,
    `assets/backgrounds/${category.slug}.svg`,
    "assets/logo.png",
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
  return `/${match || "assets/logo.png"}`;
}

function simpleCategoryCard(category) {
  const topics = (category.topics || []).slice(0, 3).map((topic) => topic.en).join(" · ");
  return `<a class="category-card has-art" href="/${escapeHtml(category.slug)}" aria-label="${escapeHtml(category.title.en)}">
          <div class="category-card-bg" aria-hidden="true">
            <span class="category-card-count-badge">${category.count} Q</span>
          </div>
          <div class="category-card-overlay">
            <h3 class="category-title">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title.en)}</h3>
            ${topics ? `<p class="category-card-topics">${escapeHtml(topics)}</p>` : ""}
          </div>
          <div class="category-card-footer">
            <span class="category-card-label">${category.count} questions</span>
            <span class="category-card-enter">Enter</span>
          </div>
        </a>`;
}

function renderCategoryPage(category, cards) {
  const section = sectionBySlug.get(category.slug);
  if (!section) throw new Error(`Missing section for ${category.slug}`);
  const previewCards = cards.slice(0, PREVIEW_CARD_COUNT);
  const canonical = `${SITE_ORIGIN}/${category.slug}`;
  const title = `${category.title.en} Quiz: ${category.count} Questions | JAKH`;
  const description = categoryMetaDescription(category);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Quiz",
        "@id": `${canonical}#quiz`,
        name: `${category.title.en} Quiz & Questions`,
        description,
        url: canonical,
        inLanguage: ["en", "ar"],
        isAccessibleForFree: true,
        educationalLevel: "beginner to advanced",
        about: { "@type": "Thing", name: category.title.en },
        provider: { "@type": "Organization", name: "JAKH Riddles", url: `${SITE_ORIGIN}/` },
        hasPart: previewCards.map((card) => ({
          "@type": "Question",
          "@id": `${canonical}#${card.id}`,
          eduQuestionType: "Flashcard",
          text: card.question.en,
          acceptedAnswer: { "@type": "Answer", text: card.answer.en },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Mind Lab", item: `${SITE_ORIGIN}/mind-lab` },
          {
            "@type": "ListItem",
            position: 3,
            name: section.title.en,
            item: `${SITE_ORIGIN}/mind-lab#section-${section.key}`,
          },
          { "@type": "ListItem", position: 4, name: category.title.en, item: canonical },
        ],
      },
    ],
  };
  const diffSummary = Object.entries(category.difficultyCounts || [])
    .map(([level, count]) => `${count} ${level.replace("-", " ")}`)
    .join(" · ");
  const topics = category.topics || [];
  const related = relatedCategories(category, section);
  const professionalNote = YMYL_SLUGS.has(category.slug)
    ? `<p class="content-standards-note"><strong>Educational use:</strong> This quiz is for learning and entertainment, not medical, legal, financial, or mental-health advice. <a href="/about#standards">Read our content standards.</a></p>`
    : `<p class="content-standards-note">Questions are curated for learning and entertainment. <a href="/about#standards">See how JAKH reviews and improves content.</a></p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="preload" href="/styles.css?v=${ASSET_VERSION}" as="style" />
    <link rel="preload" href="/app.js?v=${APP_ASSET_VERSION}" as="script" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
${socialMeta({ title, description, url: canonical, type: "article" })}
    <script type="application/ld+json">
${jsonLd(structuredData)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
    <link rel="manifest" href="/manifest.webmanifest" />
${analyticsHead()}
  </head>
  <body data-page="category" data-category="${escapeHtml(category.slug)}">
    <a href="#top" class="skip-link">Skip to main content</a>
    <header class="site-header shell">
      ${brandMarkup("en", true)}
      <nav class="header-actions" aria-label="Quick actions">
        <a class="ghost-btn" href="/" data-i18n="navHome">Home</a>
        <a class="ghost-btn" href="/mind-lab" data-i18n="navCategories">Categories</a>
        <button class="ghost-btn" id="openAuthBtn" data-i18n="authOpen">Sign in</button>
      </nav>
      <div class="header-selects" aria-label="Language controls">
        <label>
          <span data-i18n="language">Language</span>
          <select id="langSelect">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
      </div>
    </header>

    <main id="top">
      <nav class="page-breadcrumb shell" aria-label="Breadcrumb">
        <a href="/">Home</a><span aria-hidden="true">›</span>
        <a href="/mind-lab">Mind Lab</a><span aria-hidden="true">›</span>
        <a href="/mind-lab#section-${escapeHtml(section.key)}">${escapeHtml(section.title.en)}</a><span aria-hidden="true">›</span>
        <span id="breadcrumbCategoryName" aria-current="page">${escapeHtml(category.title.en)}</span>
      </nav>
      <section class="hero shell hero-category">
        <div class="hero-copy">
          <p class="eyebrow" id="categoryKicker">${escapeHtml(category.cluster.en)}</p>
          <h1 id="categoryTitle">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title.en)}</h1>
          <p class="hero-text" id="categoryDescription">${escapeHtml(category.description.en)}</p>
          <div class="hero-badges">
            <span id="categoryCountPill">${category.count} questions</span>
            <span id="categoryDiffBadge">${escapeHtml(diffSummary)}</span>
          </div>
          ${professionalNote}
        </div>
        <aside class="hero-panel hero-panel-rich">
          <img class="hero-illustration" id="categoryImage" src="${escapeHtml(categoryImagePath(category))}" alt="" />
          <div class="hero-panel-head"><p data-i18n="pageProgress">Page progress</p></div>
          <div id="categorySummaryMount"></div>
        </aside>
      </section>

      <section class="shell section-block" id="questionSection">
        <div class="section-heading library-head">
          <div>
            <p class="eyebrow" data-i18n="insidePageEyebrow">Inside this page</p>
            <h2 data-i18n="insidePageTitle">Flip the full category set</h2>
          </div>
          <p class="section-note" data-i18n="insidePageText">Use search, difficulty, favorites, solved state, and show filters where available.</p>
        </div>
        <section class="control-panel" aria-label="Question filters">
          <label class="search-field">
            <span data-i18n="searchThisPageLabel">Search this page</span>
            <input id="cardSearchInput" type="search" autocomplete="off" placeholder="Search by keyword, answer, or concept..." />
          </label>
          <div class="select-grid">
            <label><span data-i18n="difficultyLabel">Difficulty</span><select id="difficultySelect"><option value="all">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="very-advanced">Difficult</option></select></label>
            <label><span data-i18n="showLabel">Show</span><select id="viewSelect"><option value="all">Everything</option><option value="unsolved">Only unsolved</option><option value="solved">Only solved</option><option value="favorites">Only favorites</option></select></label>
            <label><span data-i18n="sortLabel">Sort</span><select id="sortSelect"><option value="featured">Featured order</option><option value="difficulty">By difficulty</option><option value="az">A → Z</option><option value="random">Shuffle now</option></select></label>
          </div>
          <div id="subcategoryWrap" class="subcategory-wrap">
            <p class="mini-label" data-i18n="subcategoriesLabel">Subcategories</p>
            <div class="chip-row" id="subcategoryFilters">
              <button class="category-chip is-active" data-subcategory="all">All · ${category.count}</button>
              ${topics.map((topic) => `<button class="category-chip" data-subcategory="${escapeHtml(topic.en)}">${escapeHtml(topic.en)} · ${topic.count}</button>`).join("\n              ")}
            </div>
          </div>
        </section>
        <div class="library-toolbar">
          <p id="resultsLabel">Showing all ${category.count} cards.</p>
          <button class="text-btn" id="resetPageBtn" data-i18n="resetFilters">Reset filters</button>
        </div>
        <div id="emptyState" class="empty-state hidden">
          <strong data-i18n="emptyTitle">No cards match that combination.</strong>
          <p data-i18n="emptyText">Try clearing a filter or broadening the search.</p>
        </div>
        <div id="cardGrid" class="riddle-grid" aria-live="polite">
        <!-- SEO:CARDS:START -->
        ${previewCards.map((card, index) => staticCardMarkup(category, card, index)).join("\n        ")}
        <!-- SEO:CARDS:END -->
        </div>
      </section>

      <section class="shell section-block">
        <div class="section-heading library-head">
          <div><p class="eyebrow" data-i18n="relatedEyebrow">Keep exploring</p><h2 data-i18n="relatedTitle">Related category pages</h2></div>
          <p class="section-note" data-i18n="relatedText">Jump to nearby topics without going back to the home page.</p>
        </div>
        <div id="relatedCategories" class="category-grid">
          ${related.map(simpleCategoryCard).join("\n          ")}
        </div>
      </section>
    </main>

    ${globalFooter("en", true, "", "app")}
    ${authModal()}
    <script src="/app.js?v=${APP_ASSET_VERSION}"></script>
  </body>
</html>`;
}

function directoryMarkup() {
  return (catalog.sections || []).map((section) => {
    const categories = (section.members || []).map((slug) => categoryBySlug.get(slug)).filter(Boolean);
    const total = categories.reduce((sum, category) => sum + Number(category.count || 0), 0);
    return `<section id="section-${escapeHtml(section.key)}" class="directory-section-header" style="--section-gradient:${escapeHtml(section.gradient)};--section-accent:${escapeHtml(section.accent)};">
            <span class="directory-section-mark" aria-hidden="true">${escapeHtml(section.mark)}</span>
            <div><h3>${escapeHtml(section.title.en)}</h3><p>${escapeHtml(section.description.en)}</p></div>
            <p class="directory-section-count">${categories.length} topics · ${total.toLocaleString("en-US")} questions</p>
          </section>
          ${categories.map(simpleCategoryCard).join("\n          ")}`;
  }).join("\n          ");
}

function injectDirectory(source) {
  const content = `<!-- SEO:DIRECTORY:START -->\n          ${directoryMarkup()}\n          <!-- SEO:DIRECTORY:END -->`;
  if (source.includes("<!-- SEO:DIRECTORY:START -->")) {
    return source.replace(
      /<!-- SEO:DIRECTORY:START -->[\s\S]*?<!-- SEO:DIRECTORY:END -->/u,
      content,
    );
  }
  return source.replace(
    /(<div id="categoryDirectoryGrid" class="category-grid" aria-live="polite">)\s*(<\/div>)/u,
    `$1\n          ${content}\n        $2`,
  );
}

function normalizeInternalLinks(source) {
  const knownSlugs = new Set([
    ...categoryBySlug.keys(),
    ...GAME_SLUGS,
    "mind-lab",
    "play",
    "collections",
    "about",
  ]);
  return source.replace(/\bhref=(["'])([^"']+)\1/giu, (full, quote, raw) => {
    if (!raw || raw.startsWith("#") || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(raw)) return full;
    const [pathname, suffix = ""] = raw.split(/(?=[?#])/u, 2);
    if (pathname === "index.html") return `href=${quote}/${suffix}${quote}`;
    const match = pathname.match(/^([a-z0-9-]+)\.html$/iu);
    if (!match || !knownSlugs.has(match[1])) return full;
    return `href=${quote}/${match[1]}${suffix}${quote}`;
  });
}

function normalizeSocialMeta(source) {
  let next = source.replaceAll("https://jakh.net/assets/og-image.webp", OG_IMAGE_URL);
  next = next.replaceAll("assets/og-image.webp", "/assets/og-image.jpg");
  next = next.replace(/styles\.css\?v=\d+/gu, `styles.css?v=${ASSET_VERSION}`);
  next = next.replace(/app\.js\?v=\d+/gu, `app.js?v=${APP_ASSET_VERSION}`);
  next = next.replace(/site-i18n\.js\?v=\d+/gu, `site-i18n.js?v=${ASSET_VERSION}`);
  next = next.replace(/game-i18n\.js\?v=\d+/gu, `game-i18n.js?v=${ASSET_VERSION}`);
  next = next.replace(/\s*<meta name="keywords"[^>]*\/?>/giu, "");
  next = next.replace(/\s*<!-- Hreflang[^>]*-->\s*/giu, "\n");
  next = next.replace(/\s*<link rel="alternate" hreflang="(?:en|ar|x-default)"[^>]*\/?>/giu, "");
  if (next.includes('property="og:image"') && !next.includes('property="og:image:type"')) {
    next = next.replace(
      /(<meta property="og:image"[^>]*\/?>)/iu,
      `$1\n    <meta property="og:image:type" content="image/jpeg" />`,
    );
  }
  if (next.includes('property="og:image"') && !next.includes('property="og:image:alt"')) {
    next = next.replace(
      /(<meta property="og:image:height"[^>]*\/?>)/iu,
      `$1\n    <meta property="og:image:alt" content="JAKH — 3,553 bilingual riddles across 56 topics and 10 games" />`,
    );
  }
  if (next.includes('name="twitter:image"') && !next.includes('name="twitter:image:alt"')) {
    next = next.replace(
      /(<meta name="twitter:image"[^>]*\/?>)/iu,
      `$1\n    <meta name="twitter:image:alt" content="JAKH — 3,553 bilingual riddles across 56 topics and 10 games" />`,
    );
  }
  next = next.replace(
    /rel="noopener noreferrer"(?=[^>]*class="social-link")/giu,
    'rel="me noopener noreferrer"',
  );
  return next;
}

function ensureFooterLinks(source) {
  const footerLinks = `<nav class="footer-site-links" aria-label="JAKH information" data-i18n-aria-label="footerInfoLabel"><a href="/collections" data-i18n="footerCollections">Collections</a><a href="/about" data-i18n="footerAbout">About &amp; content standards</a></nav>`;
  if (source.includes("footer-site-links")) {
    return source.replace(
      /<nav class="footer-site-links"[\s\S]*?<\/nav>/iu,
      footerLinks,
    );
  }
  if (source.includes('<div class="footer-socials">')) {
    return source.replace(
      '<div class="footer-socials">',
      `${footerLinks}\n        <div class="footer-socials">`,
    );
  }
  return source;
}

function addGameStructuredData(source, slug) {
  if (source.includes('"@type": "VideoGame"')) return source;
  const data = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: GAME_NAMES[slug],
    description: GAME_DESCRIPTIONS[slug],
    url: `${SITE_ORIGIN}/${slug}`,
    gamePlatform: "Web browser",
    operatingSystem: "Any",
    applicationCategory: "GameApplication",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: "JAKH Riddles", url: `${SITE_ORIGIN}/` },
  };
  return source.replace(
    /<\/head>/iu,
    `    <script type="application/ld+json">\n${jsonLd(data)}\n    </script>\n  </head>`,
  );
}

function addPlayStructuredData(source) {
  if (source.includes('"@type": "ItemList"')) return source;
  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Free JAKH Browser Games",
    numberOfItems: GAME_SLUGS.length,
    itemListElement: GAME_SLUGS.map((slug, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: GAME_NAMES[slug],
      url: `${SITE_ORIGIN}/${slug}`,
    })),
  };
  return source.replace(
    /<\/head>/iu,
    `    <script type="application/ld+json">\n${jsonLd(data)}\n    </script>\n  </head>`,
  );
}

function replaceMetaContent(source, attributeName, attributeValue, content) {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedValue = attributeValue.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+${escapedName}="${escapedValue}"\\s+content="[^"]*"\\s*\\/?>`,
    "iu",
  );
  return source.replace(
    pattern,
    `<meta ${attributeName}="${attributeValue}" content="${escapeHtml(content)}" />`,
  );
}

function updateHomeStructuredData(source) {
  return source.replace(
    /(<script type="application\/ld\+json">)\s*[\s\S]*?(<\/script>)/iu,
    `$1
${jsonLd({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: "JAKH Riddles",
      description: "A bilingual knowledge playground with 3,553 questions across 56 topics and 10 free browser games.",
      inLanguage: ["en", "ar"],
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_ORIGIN}/#webpage`,
      url: `${SITE_ORIGIN}/`,
      name: "JAKH Riddles: Free Arabic & English Quizzes",
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      description: "Free bilingual riddles, quiz questions, brain teasers, and browser games in English and Arabic.",
      inLanguage: ["en", "ar"],
    },
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "JAKH Riddles",
      url: `${SITE_ORIGIN}/`,
      logo: `${SITE_ORIGIN}/assets/logo.png`,
      sameAs: [
        "https://www.instagram.com/jakhriddles/",
        "https://www.facebook.com/profile.php?id=61588921894305",
      ],
    },
  ],
})}
    $2`,
  );
}

function normalizeExistingPage(source, file) {
  let next = normalizeInternalLinks(source);
  next = normalizeSocialMeta(next);
  next = ensureFooterLinks(next);
  next = next
    .replace(/\sdata-theme="light"/gu, "")
    .replace(/\s*document\.documentElement\.dataset\.theme\s*=\s*["']light["'];?\s*/gu, "\n")
    .replace(/<script>\s*<\/script>\s*/gu, "")
    .replace(
      /(class="brand-logo"\s+width=")180("\s+height=")44(")/gu,
      "$140$240$3",
    )
    .replace(
      /<section class="hero shell" style="padding-bottom:1rem;">/gu,
      '<section class="hero shell">',
    );
  if (file === "mind-lab.html") next = injectDirectory(next);
  if (file === "index.html") {
    next = updateHomeStructuredData(next)
      .replace(
        /<title>[\s\S]*?<\/title>/iu,
        "<title>JAKH Riddles: Free Arabic &amp; English Quizzes</title>",
      )
      .replace(
        /(<span class="kv-stat-number" id="badgeCategories">)\d+(<\/span>)/u,
        "$156$2",
      );
  }
  if (file === "play.html") {
    const title = "10 Free Browser Games | JAKH";
    const description = "Play 10 free browser games on JAKH: Chess, Go, Reversi, Mastermind, Catan Lite, Backgammon, SET, Hanabi, Codenames, and Diplomacy.";
    next = addPlayStructuredData(next)
      .replace(/<title>[\s\S]*?<\/title>/iu, `<title>${title}</title>`)
      .replace(
        /<meta name="description" content="[^"]*"\s*\/?>/iu,
        `<meta name="description" content="${description}" />`,
      );
    next = replaceMetaContent(next, "property", "og:title", title);
    next = replaceMetaContent(next, "property", "og:description", description);
    next = replaceMetaContent(next, "name", "twitter:title", title);
    next = replaceMetaContent(next, "name", "twitter:description", description);
  }
  if (GAME_SLUGS.includes(file.replace(/\.html$/u, ""))) {
    const slug = file.replace(/\.html$/u, "");
    const title = `${GAME_NAMES[slug]} Online — Free Browser Game | JAKH`;
    const description = truncate(
      `${GAME_DESCRIPTIONS[slug]} Play instantly with no download or sign-up.`,
      158,
    );
    next = addGameStructuredData(next, slug);
    next = next.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${escapeHtml(title)}</title>`);
    next = replaceMetaContent(next, "name", "description", description);
    next = replaceMetaContent(next, "property", "og:title", title);
    next = replaceMetaContent(next, "property", "og:description", description);
    next = replaceMetaContent(next, "name", "twitter:title", title);
    next = replaceMetaContent(next, "name", "twitter:description", description);
    if (!/\bdata-game=["']/iu.test(next)) {
      next = next.replace(/<body([^>]*)>/iu, `<body$1 data-game="${slug}">`);
    }
    if (!next.includes("site-footer")) {
      next = next.replace(/<\/body>/iu, `  ${globalFooter()}\n  </body>`);
    }
  }
  return next;
}

function loadCollectionCards(collection) {
  return collection.cards.map(({ slug, id }) => {
    if (QA_HOLD_SET.has(id)) throw new Error(`${collection.key} includes held card ${id}`);
    const category = categoryBySlug.get(slug);
    if (!category) throw new Error(`${collection.key} references unknown category ${slug}`);
    const cards = JSON.parse(fs.readFileSync(path.join(root, "data", `${slug}.json`), "utf8"));
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`${collection.key} references missing card ${slug}/${id}`);
    for (const field of ["question", "answer"]) {
      if (!cleanText(card[field]?.en) || !cleanText(card[field]?.ar)) {
        throw new Error(`${collection.key} includes incomplete ${field} on ${id}`);
      }
    }
    return { ...card, sourceCategory: category };
  });
}

function collectionSlug(collection, lang) {
  return collection.slug?.[lang] || collection.slugs?.[lang];
}

function collectionTitle(collection, lang) {
  return collection.title?.[lang] || collection.titles?.[lang];
}

function collectionDescription(collection, lang) {
  return collection.metaDescription?.[lang] || collection.metaDescriptions?.[lang];
}

function collectionHeading(collection, lang) {
  return collection.heading?.[lang]
    || collectionTitle(collection, lang).replace(/\s*\|\s*JAKH\s*$/u, "");
}

function collectionSourceLabel(collection, lang) {
  if (collection.sourceLabel?.[lang]) return collection.sourceLabel[lang];
  return (collection.sourceCategories || [])
    .map((source) => source.label?.[lang] || source.slug)
    .join(lang === "ar" ? "، " : ", ");
}

function collectionDisclaimer(collection, lang) {
  return collection.disclaimer?.[lang] || collection.visibleDisclaimer?.[lang] || "";
}

function collectionUrl(collection, lang) {
  return `${SITE_ORIGIN}/${lang}/${collectionSlug(collection, lang)}/`;
}

function renderCollectionPage(collection, lang, cards) {
  const isAr = lang === "ar";
  const otherLang = isAr ? "en" : "ar";
  const canonical = collectionUrl(collection, lang);
  const alternate = collectionUrl(collection, otherLang);
  const languageQuery = `?lang=${lang}`;
  const title = collectionTitle(collection, lang);
  const description = collectionDescription(collection, lang);
  const label = isAr ? "الإجابة" : "Answer";
  const sourceLabel = isAr ? "افتح البطاقة التفاعلية" : "Open the interactive card";
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Quiz",
        "@id": `${canonical}#quiz`,
        name: title.replace(/\s*\|\s*JAKH\s*$/u, ""),
        description,
        url: canonical,
        inLanguage: lang,
        isAccessibleForFree: true,
        provider: { "@type": "Organization", name: "JAKH Riddles", url: `${SITE_ORIGIN}/` },
        hasPart: cards.map((card) => ({
          "@type": "Question",
          "@id": `${canonical}#${card.id}`,
          eduQuestionType: "Flashcard",
          text: card.question[lang],
          acceptedAnswer: { "@type": "Answer", text: card.answer[lang] },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: isAr ? "الرئيسية" : "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: isAr ? "المجموعات" : "Collections", item: `${SITE_ORIGIN}/collections` },
          { "@type": "ListItem", position: 3, name: collectionHeading(collection, lang), item: canonical },
        ],
      },
    ],
  };
  const qaMarkup = cards.map((card, index) => `<article class="seo-qa-card" id="${escapeHtml(card.id)}">
          <details>
            <summary><span class="seo-question-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(card.question[lang])}</span></summary>
            <div class="seo-answer">
              <p class="seo-answer-label">${label}</p>
              <p>${escapeHtml(card.answer[lang])}</p>
              <a href="/${escapeHtml(card.sourceCategory.slug)}?card=${encodeURIComponent(card.id)}&amp;lang=${lang}">${sourceLabel} ${isAr ? "←" : "→"}</a>
            </div>
          </details>
        </article>`).join("\n        ");
  const disclaimerText = collectionDisclaimer(collection, lang);
  const disclaimer = disclaimerText
    ? `<aside class="collection-disclaimer">${escapeHtml(disclaimerText)}</aside>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  <head>
    <meta charset="UTF-8" />
    <script>
      try {
        var savedSettings = JSON.parse(localStorage.getItem("jakh-riddles-settings") || "{}");
        if (!savedSettings || typeof savedSettings !== "object" || Array.isArray(savedSettings)) savedSettings = {};
        savedSettings.lang = "${lang}";
        localStorage.setItem("jakh-riddles-settings", JSON.stringify(savedSettings));
      } catch (_) {}
    </script>
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="${lang}" href="${canonical}" />
    <link rel="alternate" hreflang="${otherLang}" href="${alternate}" />
    <link rel="alternate" hreflang="x-default" href="${collectionUrl(collection, "en")}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
${socialMeta({ title, description, url: canonical, type: "article", lang })}
    <script type="application/ld+json">
${jsonLd(structured)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
${analyticsHead()}
  </head>
  <body class="seo-page">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    <header class="site-header shell">
      ${brandMarkup(lang, false, `/${languageQuery}`)}
      <nav class="header-actions" aria-label="${isAr ? "التنقل" : "Quick actions"}">
        <a class="ghost-btn" href="/${languageQuery}">${isAr ? "الرئيسية" : "Home"}</a>
        <a class="ghost-btn" href="/collections${languageQuery}">${isAr ? "المجموعات" : "Collections"}</a>
        <a class="ghost-btn" href="${alternate}" lang="${otherLang}" dir="${isAr ? "ltr" : "rtl"}">${isAr ? "English" : "العربية"}</a>
      </nav>
    </header>
    <main id="content">
      <section class="seo-collection-hero shell">
        <p class="eyebrow">${isAr ? "مجموعة مختارة من JAKH" : "Curated by JAKH"}</p>
        <h1>${escapeHtml(collectionHeading(collection, lang))}</h1>
        <p>${escapeHtml(collection.intro[lang])}</p>
        <div class="seo-collection-meta">
          <span>${cards.length} ${isAr ? "سؤالاً" : "questions"}</span>
          <span>${isAr ? "العربية والإنجليزية" : "English and Arabic"}</span>
          <span>${isAr ? "مجاني" : "Free"}</span>
        </div>
${disclaimer ? `        ${disclaimer}\n` : ""}
      </section>
      <section class="seo-question-list shell" aria-label="${isAr ? "الأسئلة والأجوبة" : "Questions and answers"}">
        ${qaMarkup}
      </section>
      <section class="seo-next-step shell">
        <h2>${isAr ? "واصل اللعب" : "Keep playing"}</h2>
        <p>${isAr ? "استكشف المجموعة الكاملة، وبدّل اللغة، وتابع نتيجتك في مختبر العقل." : "Explore the full library, switch languages, and track your score in the Mind Lab."}</p>
        <div class="hero-actions">
          <a class="primary-btn" href="/mind-lab${languageQuery}">${isAr ? "افتح مختبر العقل" : "Open the Mind Lab"}</a>
          <a class="ghost-btn" href="/collections${languageQuery}">${isAr ? "كل المجموعات" : "All collections"}</a>
        </div>
      </section>
    </main>
    ${globalFooter(lang, false, languageQuery)}
  </body>
</html>`;
}

function renderCollectionsHub(collectionsWithCards) {
  const title = "Riddles & Quiz Collections in English and Arabic | JAKH";
  const description = "Explore focused JAKH collections of riddles, kids questions, logic puzzles, general knowledge, football, and nostalgia quizzes in English and Arabic.";
  const translationPrefixes = {
    "riddles-with-answers": "collectionClassic",
    "kids-riddles-with-answers": "collectionKids",
    "logic-puzzles-with-answers": "collectionLogic",
    "general-knowledge-quiz-questions": "collectionGeneral",
    "spacetoon-quiz": "collectionSpacetoon",
    "football-rules-quiz": "collectionFootball",
  };
  const cards = collectionsWithCards.map(({ collection, cards: collectionCards }) => {
    const prefix = translationPrefixes[collection.key];
    if (!prefix) throw new Error(`Missing collections hub translation prefix for ${collection.key}`);
    return `<article class="seo-hub-card">
          <p class="eyebrow" data-i18n="${prefix}Meta">${collectionCards.length} questions · ${escapeHtml(collectionSourceLabel(collection, "en"))}</p>
          <h2 data-i18n="${prefix}Title">${escapeHtml(collectionHeading(collection, "en"))}</h2>
          <p data-i18n="${prefix}Text">${escapeHtml(collection.intro.en)}</p>
          <div class="seo-language-links">
            <a class="primary-btn" href="/en/${escapeHtml(collectionSlug(collection, "en"))}/" lang="en" dir="ltr" data-i18n="englishLabel">English</a>
            <a class="ghost-btn" href="/ar/${escapeHtml(collectionSlug(collection, "ar"))}/" lang="ar" dir="rtl" data-i18n="arabicLabel">العربية</a>
          </div>
        </article>`;
  }).join("\n        ");
  const structured = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "JAKH Riddle & Quiz Collections",
    description,
    url: `${SITE_ORIGIN}/collections`,
    inLanguage: ["en", "ar"],
    hasPart: collectionsWithCards.flatMap(({ collection }) => ([
      { "@type": "Quiz", name: collectionHeading(collection, "en"), url: collectionUrl(collection, "en") },
      { "@type": "Quiz", name: collectionHeading(collection, "ar"), url: collectionUrl(collection, "ar"), inLanguage: "ar" },
    ])),
  };
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${SITE_ORIGIN}/collections" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
${socialMeta({ title, description, url: `${SITE_ORIGIN}/collections` })}
    <script type="application/ld+json">
${jsonLd(structured)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
${analyticsHead()}
  </head>
  <body class="seo-page" data-i18n-page="collections">
    <a href="#content" class="skip-link" data-i18n="skipMain">Skip to main content</a>
    <header class="site-header shell">
      ${brandMarkup("en", true)}
      <nav class="header-actions" aria-label="Quick actions" data-i18n-aria-label="quickActionsLabel">
        <a class="ghost-btn" href="/" data-i18n="navHome">Home</a>
        <a class="ghost-btn" href="/mind-lab" data-i18n="navMindLab">Mind Lab</a>
        <a class="ghost-btn" href="/play" data-i18n="navGames">Games</a>
      </nav>
      <div class="header-selects" aria-label="Language controls" data-i18n-aria-label="languageControlsLabel">
        <label>
          <span data-i18n="language">Language</span>
          <select id="langSelect">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
      </div>
    </header>
    <main id="content">
      <section class="seo-collection-hero shell">
        <p class="eyebrow" data-i18n="collectionsEyebrow">Focused ways to play</p>
        <h1 data-i18n="collectionsTitle">Riddles and quiz collections</h1>
        <p data-i18n="collectionsIntro">Start with a focused collection, reveal each answer at your own pace, then continue into the full 3,553-question Mind Lab.</p>
      </section>
      <section class="seo-hub-grid shell">
        ${cards}
      </section>
    </main>
    ${globalFooter("en", true)}
    <script defer src="/site-i18n.js?v=${ASSET_VERSION}"></script>
  </body>
</html>`;
}

function renderAboutPage() {
  const title = "About JAKH & Our Content Standards";
  const description = "Learn how JAKH organizes, reviews, translates, and improves its 3,553 bilingual questions, plus how to report a correction.";
  const structured = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: title,
    description,
    url: `${SITE_ORIGIN}/about`,
    inLanguage: ["en", "ar"],
    about: { "@id": `${SITE_ORIGIN}/#organization` },
  };
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${SITE_ORIGIN}/about" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
${socialMeta({ title, description, url: `${SITE_ORIGIN}/about` })}
    <script type="application/ld+json">
${jsonLd(structured)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
${analyticsHead()}
  </head>
  <body class="seo-page" data-i18n-page="about">
    <a href="#content" class="skip-link" data-i18n="skipMain">Skip to main content</a>
    <header class="site-header shell">
      ${brandMarkup("en", true)}
      <nav class="header-actions" aria-label="Quick actions" data-i18n-aria-label="quickActionsLabel">
        <a class="ghost-btn" href="/" data-i18n="navHome">Home</a>
        <a class="ghost-btn" href="/mind-lab" data-i18n="navMindLab">Mind Lab</a>
        <a class="ghost-btn" href="/collections" data-i18n="navCollections">Collections</a>
      </nav>
      <div class="header-selects" aria-label="Language controls" data-i18n-aria-label="languageControlsLabel">
        <label>
          <span data-i18n="language">Language</span>
          <select id="langSelect">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
      </div>
    </header>
    <main id="content" class="standards-page shell">
      <section class="seo-collection-hero">
        <p class="eyebrow" data-i18n="aboutEyebrow">About JAKH</p>
        <h1 data-i18n="aboutTitle">A friendly bilingual place to think, learn, and play</h1>
        <p data-i18n="aboutIntro">JAKH is a free English-and-Arabic riddle, quiz, and browser-game website. The library currently includes 3,553 question cards mapped into 56 topics and five clear sections.</p>
      </section>
      <section id="standards" class="standards-grid">
        <article><h2 data-i18n="standardsOrganizedTitle">How content is organized</h2><p data-i18n="standardsOrganizedText">Every question belongs to one category, one practical subtopic, and one difficulty level. Related categories and focused collections help people move through the library without a maze of overlapping pages.</p></article>
        <article><h2 data-i18n="standardsTranslationTitle">Review and translation</h2><p data-i18n="standardsTranslationText">Questions require complete English and Arabic prompts and answers. Automated audits catch missing fields, taxonomy drift, and exact duplicates; high-traffic collections receive an additional meaning and answer-parity review before publication.</p></article>
        <article><h2 data-i18n="standardsAccuracyTitle">Accuracy and corrections</h2><p data-i18n-html="standardsAccuracyText">Evergreen facts are preferred. Time-sensitive facts and professional topics need extra review. You can flag an individual card from its share/report controls or send a correction through the suggestion box in the <a href="/mind-lab">Mind Lab</a>.</p></article>
        <article><h2 data-i18n="standardsBoundariesTitle">Educational boundaries</h2><p data-i18n="standardsBoundariesText">JAKH is for learning and entertainment. Medical, legal, financial, pharmacy, and psychology questions are not professional advice and should not be used to make personal decisions.</p></article>
        <article><h2 data-i18n="standardsIndependenceTitle">Independence</h2><p data-i18n="standardsIndependenceText">Fan-made quizzes are clearly labelled and do not imply affiliation, endorsement, or ownership of third-party names or marks. JAKH does not use unlicensed character artwork in its focused collections.</p></article>
        <article><h2 data-i18n="standardsConnectedTitle">Stay connected</h2><p data-i18n-html="standardsConnectedText">Follow <a class="social-link" rel="me noopener noreferrer" href="https://www.instagram.com/jakhriddles/">JAKH Riddles on Instagram</a> and <a class="social-link" rel="me noopener noreferrer" href="https://www.facebook.com/profile.php?id=61588921894305">JAKH Riddles on Facebook</a> for new riddles and site updates.</p></article>
      </section>
    </main>
    ${globalFooter("en", true)}
    <script defer src="/site-i18n.js?v=${ASSET_VERSION}"></script>
  </body>
</html>`;
}

function sitemapUrl(url, priority, alternates = null) {
  const alternateMarkup = alternates
    ? `\n${Object.entries(alternates).map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeHtml(href)}"/>`).join("\n")}`
    : "";
  return `  <url>
    <loc>${escapeHtml(url)}</loc>
    <lastmod>${LAST_MODIFIED}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>${alternateMarkup}
  </url>`;
}

function renderSitemap() {
  const entries = [
    sitemapUrl(`${SITE_ORIGIN}/`, "1.0"),
    sitemapUrl(`${SITE_ORIGIN}/mind-lab`, "0.95"),
    sitemapUrl(`${SITE_ORIGIN}/collections`, "0.95"),
    sitemapUrl(`${SITE_ORIGIN}/play`, "0.90"),
    sitemapUrl(`${SITE_ORIGIN}/about`, "0.60"),
    ...(catalog.categories || []).map((category) => sitemapUrl(`${SITE_ORIGIN}/${category.slug}`, "0.85")),
    ...GAME_SLUGS.map((slug) => sitemapUrl(`${SITE_ORIGIN}/${slug}`, "0.75")),
  ];
  for (const collection of SEO_COLLECTIONS) {
    const en = collectionUrl(collection, "en");
    const ar = collectionUrl(collection, "ar");
    const alternates = { en, ar, "x-default": en };
    entries.push(sitemapUrl(en, "0.90", alternates));
    entries.push(sitemapUrl(ar, "0.90", alternates));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>`;
}

for (const category of catalog.categories || []) {
  const cards = JSON.parse(fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"));
  emit(`${category.slug}.html`, renderCategoryPage(category, cards));
}

for (const file of ["index.html", "mind-lab.html", "play.html", "404.html", ...GAME_SLUGS.map((slug) => `${slug}.html`)]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  emit(file, normalizeExistingPage(source, file));
}

const collectionsWithCards = SEO_COLLECTIONS.map((collection) => ({
  collection,
  cards: loadCollectionCards(collection),
}));
for (const { collection, cards } of collectionsWithCards) {
  for (const lang of ["en", "ar"]) {
    emit(`${lang}/${collectionSlug(collection, lang)}/index.html`, renderCollectionPage(collection, lang, cards));
  }
}
emit("collections.html", renderCollectionsHub(collectionsWithCards));
emit("about.html", renderAboutPage());
emit("sitemap.xml", renderSitemap());

writeOutputs();

if (stale.length) {
  console.error(`SEO generation is stale for ${stale.length} file(s):`);
  for (const file of stale) console.error(`- ${file}`);
  process.exit(1);
}

console.log(
  `${checkOnly ? "SEO generation is current" : "Generated SEO pages"}: `
  + `${catalog.categories.length} categories, ${SEO_COLLECTIONS.length * 2} localized collections, `
  + `${GAME_SLUGS.length} games.`,
);
