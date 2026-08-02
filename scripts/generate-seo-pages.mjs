import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QA_HOLD_IDS, SEO_COLLECTIONS } from "./seo-collections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const SITE_ORIGIN = "https://jakh.net";
const ASSET_VERSION = "2026080201";
const APP_ASSET_VERSION = "2026080201";
const PRIVACY_ASSET_VERSION = "2026080101";
const LAST_MODIFIED = "2026-08-01";
const TOPIC_PAGE_SIZE = 20;
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
const SHARED_LOCALIZED_ROUTES = [
  { file: "index.html", en: "/", ar: "/ar/", priority: "1.0" },
  { file: "mind-lab.html", en: "/mind-lab", ar: "/ar/mind-lab/", priority: "0.95" },
  { file: "collections.html", en: "/collections", ar: "/ar/collections/", priority: "0.95" },
  { file: "play.html", en: "/play", ar: "/ar/play/", priority: "0.90" },
  { file: "about.html", en: "/about", ar: "/ar/about/", priority: "0.60" },
  { file: "privacy.html", en: "/privacy", ar: "/ar/privacy/", priority: "0.60" },
  ...GAME_SLUGS.map((slug) => ({
    file: `${slug}.html`,
    en: `/${slug}`,
    ar: `/ar/games/${slug}/`,
    priority: "0.75",
  })),
];
const SHARED_ROUTE_BY_FILE = new Map(SHARED_LOCALIZED_ROUTES.map((route) => [route.file, route]));

function localizedSharedRoute(file, lang = "en") {
  const route = SHARED_ROUTE_BY_FILE.get(file);
  if (!route) throw new Error(`Unknown localized shared route for ${file}`);
  return route[lang];
}
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

function rasterDimensions(buffer) {
  if (
    buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { type: "image/png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 30 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xFF) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
        return { type: "image/jpeg", width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
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
        width: buffer.readUInt16LE(26) & 0x3FFF,
        height: buffer.readUInt16LE(28) & 0x3FFF,
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
        width: 1 + (bits & 0x3FFF),
        height: 1 + ((bits >> 14) & 0x3FFF),
      };
    }
  }
  return null;
}

function rasterSocialImage(relativePath, alt) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const dimensions = rasterDimensions(fs.readFileSync(absolutePath));
  if (!dimensions?.width || !dimensions?.height) return null;
  return {
    url: `${SITE_ORIGIN}/${relativePath}`,
    type: dimensions.type,
    width: dimensions.width,
    height: dimensions.height,
    alt,
  };
}

const DEFAULT_SOCIAL_IMAGE = rasterSocialImage(
  "assets/og-image.jpg",
  "JAKH — 3,553 bilingual riddles across 56 topics and 10 games",
);
if (!DEFAULT_SOCIAL_IMAGE) throw new Error("Missing or unreadable assets/og-image.jpg");

function quizStructuredData({ canonical, name, description, lang, subjectNames, cards }) {
  const subjects = [...new Set(subjectNames.map(cleanText).filter(Boolean))];
  if (!subjects.length) throw new Error(`Quiz ${canonical} needs at least one educational subject`);
  const concepts = subjects.map((subject) => ({ "@type": "Thing", name: subject }));
  return {
    "@type": "Quiz",
    "@id": `${canonical}#quiz`,
    name,
    description,
    url: canonical,
    inLanguage: lang,
    isAccessibleForFree: true,
    about: concepts.length === 1 ? concepts[0] : concepts,
    educationalAlignment: subjects.map((subject) => ({
      "@type": "AlignmentObject",
      alignmentType: "educationalSubject",
      targetName: subject,
    })),
    provider: { "@type": "Organization", name: "JAKH Riddles", url: `${SITE_ORIGIN}/` },
    hasPart: cards.map((card) => ({
      "@type": "Question",
      "@id": `${canonical}#${card.id}`,
      eduQuestionType: "Flashcard",
      text: card.question[lang],
      acceptedAnswer: { "@type": "Answer", text: card.answer[lang] },
    })),
  };
}

function socialMeta({ title, description, url, type = "website", lang = "en", image = DEFAULT_SOCIAL_IMAGE }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const locale = lang === "ar" ? "ar_AE" : "en_US";
  const selectedImage = image || DEFAULT_SOCIAL_IMAGE;
  const imageAlt = selectedImage === DEFAULT_SOCIAL_IMAGE && lang === "ar"
    ? "JAKH — 3,553 لغزًا بالعربية والإنجليزية، ضمن 56 موضوعًا و10 ألعاب"
    : selectedImage.alt;
  return `    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:locale" content="${locale}" />
    <meta property="og:image" content="${escapeHtml(selectedImage.url)}" />
    <meta property="og:image:type" content="${escapeHtml(selectedImage.type)}" />
    <meta property="og:image:width" content="${selectedImage.width}" />
    <meta property="og:image:height" content="${selectedImage.height}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
    <meta property="og:site_name" content="JAKH Riddles" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${escapeHtml(selectedImage.url)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />`;
}

function analyticsHead() {
  return `    <script defer src="/privacy-consent.js?v=${PRIVACY_ASSET_VERSION}"></script>`;
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

function globalFooter(lang = "en", dynamic = false, languageQuery = "", translationContract = "site", physicalRoutes = false) {
  const isAr = lang === "ar";
  const instagramLabel = isAr ? "ألغاز JAKH على إنستغرام" : "JAKH Riddles on Instagram";
  const facebookLabel = isAr ? "ألغاز JAKH على فيسبوك" : "JAKH Riddles on Facebook";
  const instagramKey = translationContract === "app" ? "socialInstagramLabel" : "instagramLabel";
  const facebookKey = translationContract === "app" ? "socialFacebookLabel" : "facebookLabel";
  const instagramI18n = dynamic ? ` data-i18n-aria-label="${instagramKey}"` : "";
  const facebookI18n = dynamic ? ` data-i18n-aria-label="${facebookKey}"` : "";
  const collectionsHref = physicalRoutes && isAr ? "/ar/collections/" : `/collections${languageQuery}`;
  const aboutHref = physicalRoutes && isAr ? "/ar/about/" : `/about${languageQuery}`;
  const privacyHref = physicalRoutes && isAr ? "/ar/privacy/" : `/privacy${languageQuery}`;
  return `<footer class="site-footer shell">
      <div class="footer-inner">
        <p class="footer-copy" data-i18n="footerNote">${isAr ? "جميع الحقوق محفوظة لـ JAKH 2026" : "All rights reserved to JAKH 2026"}</p>
        <nav class="footer-site-links" aria-label="${isAr ? "معلومات JAKH" : "JAKH information"}" data-i18n-aria-label="footerInfoLabel">
          <a href="${escapeHtml(collectionsHref)}" data-i18n="footerCollections">${isAr ? "المجموعات" : "Collections"}</a>
          <a href="${escapeHtml(aboutHref)}" data-i18n="footerAbout">${isAr ? "عن JAKH ومعايير المحتوى" : "About &amp; content standards"}</a>
          <a href="${escapeHtml(privacyHref)}" data-i18n="footerPrivacy">${isAr ? "مركز الخصوصية" : "Privacy Centre"}</a>
        </nav>
        <div class="footer-socials">
          <a href="https://www.instagram.com/jakhriddles/" target="_blank" rel="me noopener noreferrer" class="social-link" aria-label="${instagramLabel}"${instagramI18n}><span>Instagram</span></a>
          <a href="https://www.facebook.com/profile.php?id=61588921894305" target="_blank" rel="me noopener noreferrer" class="social-link" aria-label="${facebookLabel}"${facebookI18n}><span>Facebook</span></a>
        </div>
      </div>
    </footer>`;
}

function authModal(lang = "en") {
  const isAr = lang === "ar";
  return `<div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div id="authModal" class="modal hidden" aria-hidden="true">
      <div class="modal-backdrop" data-close-modal="auth"></div>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <div class="modal-head">
          <div>
            <p class="eyebrow" data-i18n="authEyebrow">${isAr ? "الملف الشخصي" : "Profile"}</p>
            <h2 id="authModalTitle" data-i18n="authTitle">${isAr ? "أنشئ حسابًا أو سجّل الدخول" : "Create account or sign in"}</h2>
          </div>
          <button class="icon-btn" data-close-modal="auth" aria-label="${isAr ? "إغلاق" : "Close"}">×</button>
        </div>
        <div id="authModalBody"></div>
      </div>
    </div>`;
}

function improveCatalogDescription(category) {
  const currentEn = cleanText(category.description?.en);
  const isGeneric = /^Explore questions about /iu.test(currentEn);
  const isStaleKids = category.slug === "kids-riddles" && /\b300[- ]card\b/iu.test(currentEn);
  const topicsEn = (category.topics || []).slice(0, 3).map((topic) => topic.en).filter(Boolean);
  const topicsAr = (category.topics || []).slice(0, 3).map((topic) => topic.ar).filter(Boolean);
  const arabicTopicList = topicsAr.length < 2
    ? topicsAr.join("")
    : topicsAr.length === 2
      ? `${topicsAr[0]} و${topicsAr[1]}`
      : `${topicsAr.slice(0, -1).join("، ")}، و${topicsAr.at(-1)}`;
  category.description = {
    en: (!currentEn || isGeneric || isStaleKids)
      ? `${category.count} bilingual ${category.title.en} questions covering ${topicsEn.join(", ")}${topicsEn.length ? ", and more" : ""}. Switch between English and Arabic, reveal answers, and track your score.`
      : currentEn,
    ar: `يضم موضوع «${category.title.ar}» ${category.count} سؤالًا بالعربية والإنجليزية${arabicTopicList ? `، ويتناول ${arabicTopicList}` : ""}. اختر لغتك، واكشف الإجابات، وتابع نتيجتك.`,
  };
}

for (const category of catalog.categories || []) {
  category.href = `/${category.slug}`;
  improveCatalogDescription(category);
}
emit("data/catalog.json", `${JSON.stringify(catalog, null, 2)}\n`);

function categoryRoute(category, lang = "en") {
  return lang === "ar"
    ? `/ar/topics/${category.slug}/`
    : `/${category.slug}`;
}

function categoryUrl(category, lang = "en") {
  return `${SITE_ORIGIN}${categoryRoute(category, lang)}`;
}

function categoryPageRoute(category, lang = "en", pageNumber = 1) {
  if (pageNumber === 1) return categoryRoute(category, lang);
  return lang === "ar"
    ? `/ar/topics/${category.slug}/page/${pageNumber}/`
    : `/${category.slug}/page/${pageNumber}/`;
}

function categoryPageUrl(category, lang = "en", pageNumber = 1) {
  return `${SITE_ORIGIN}${categoryPageRoute(category, lang, pageNumber)}`;
}

function categoryMetaDescription(category, lang = "en") {
  const topic = category.topics?.[0]?.[lang];
  if (lang === "ar") {
    return truncate(
      `${category.count} سؤالًا في موضوع «${category.title.ar}»، مع إجابات بالعربية والإنجليزية${topic ? `، ومنها أسئلة عن ${topic}` : ""}. العب مجانًا وتابع نتيجتك.`,
      158,
    );
  }
  return truncate(
    `Try ${category.count} ${category.title.en} quiz questions with answers in English and Arabic${topic ? `, covering ${topic} and more` : ""}. Play free and track your score.`,
    158,
  );
}

function categorySocialImage(category, lang = "en") {
  const alt = lang === "ar"
    ? `اختبار ${category.title.ar} على JAKH`
    : `${category.title.en} quiz on JAKH`;
  for (const relativePath of [
    `assets/backgrounds_new/${category.slug}.jpg`,
    `assets/backgrounds/${category.slug}.webp`,
    `assets/backgrounds/${category.slug}.png`,
  ]) {
    const image = rasterSocialImage(relativePath, alt);
    if (
      image
      && image.width >= 300
      && image.height >= 157
      && image.width / image.height <= 2.1
    ) return image;
  }
  return DEFAULT_SOCIAL_IMAGE;
}

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "https:" && parsed.hostname ? parsed.href : "";
  } catch {
    return "";
  }
}

function staticReviewMarkup(card, lang = "en") {
  const isAr = lang === "ar";
  const review = card?.review || { status: "pending" };
  const safetySensitive = review.safetySensitive === true || review.priority === "high";
  if (review.status !== "reviewed") {
    const label = safetySensitive
      ? (isAr ? "محتوى حساس — المراجعة التحريرية معلّقة" : "Safety-sensitive content — editorial review pending")
      : (isAr ? "المراجعة التحريرية للحقائق معلّقة" : "Editorial fact review pending");
    return `<div class="card-review card-review--pending${safetySensitive ? " card-review--safety" : ""}" role="note" aria-label="${escapeHtml(label)}">
              <p class="card-review-label"><span aria-hidden="true">${safetySensitive ? "⚠" : "◷"}</span> ${escapeHtml(label)}</p>
            </div>`;
  }

  const reviewedAt = cleanText(review.reviewedAt);
  const reviewer = cleanText(review.reviewer);
  const sources = (Array.isArray(review.sources) ? review.sources : [])
    .map((source) => ({ ...source, safeUrl: safeHttpsUrl(source?.url) }))
    .filter((source) => source.safeUrl);
  const label = isAr ? "تمت المراجعة التحريرية" : "Editorially reviewed";
  const sourceLinks = sources.map((source, index) => {
    const title = cleanText(source.title || source.publisher || source.safeUrl);
    const publisher = cleanText(source.publisher || title);
    const sourceLabel = isAr
      ? `المصدر ${index + 1}: ${title} — ${publisher}`
      : `Source ${index + 1}: ${title} — ${publisher}`;
    return `<li><a href="${escapeHtml(source.safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(sourceLabel)}"><span>${escapeHtml(title)} — ${escapeHtml(publisher)}</span><span class="card-review-external" aria-hidden="true">↗</span></a></li>`;
  }).join("");
  return `<div class="card-review card-review--reviewed" role="note" aria-label="${escapeHtml(label)}">
              <p class="card-review-label"><span aria-hidden="true">✓</span> ${escapeHtml(label)}</p>
              <p class="card-review-meta">${reviewedAt ? `<time datetime="${escapeHtml(reviewedAt)}">${isAr ? "تاريخ المراجعة" : "Reviewed"}: ${escapeHtml(reviewedAt)}</time>` : ""}${reviewer ? `<span>${isAr ? "المراجع" : "Reviewer"}: ${escapeHtml(reviewer)}</span>` : ""}</p>
              ${sourceLinks ? `<div class="card-review-sources"><span class="card-review-sources-title">${isAr ? "المصادر" : "Sources"}</span><ul>${sourceLinks}</ul></div>` : ""}
            </div>`;
}

function staticCardMarkup(category, card, lang = "en") {
  const isAr = lang === "ar";
  const difficultyLabels = isAr
    ? { easy: "سهل", medium: "متوسط", hard: "صعب", "very-advanced": "صعب جدًا" }
    : { easy: "Easy", medium: "Medium", hard: "Hard", "very-advanced": "Very advanced" };
  const difficulty = difficultyLabels[card.difficulty] || card.difficulty;
  const subcategory = card.subcategory?.[lang]
    ? `<span class="badge badge-subcategory">${escapeHtml(card.subcategory[lang])}</span>`
    : "";
  return `<article class="riddle-card" id="${escapeHtml(card.id)}" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || category.mode || "quiz")}" aria-label="${escapeHtml(card.question[lang])}">
          <div class="card-inner">
            <section class="card-face card-front" aria-hidden="false">
              <div class="card-badges">
                <span class="badge badge-category">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title[lang])}</span>
                <span class="badge badge-difficulty" data-difficulty="${escapeHtml(card.difficulty)}">${escapeHtml(difficulty)}</span>
                ${subcategory}
              </div>
              <p class="card-question">${escapeHtml(card.question[lang])}</p>
              ${staticReviewMarkup(card, lang)}
              <div class="card-actions">
                <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}">${isAr ? "عرض الإجابة" : "Flip for the answer"}</button>
              </div>
            </section>
            <section class="card-face card-back" aria-hidden="true" inert>
              <p class="card-answer"><strong>${escapeHtml(card.answer[lang])}</strong></p>
              <div class="card-actions">
                <button class="primary-btn mini-btn action-flip" data-action="flip" data-id="${escapeHtml(card.id)}" tabindex="-1">${isAr ? "عرض السؤال" : "Back to the question"}</button>
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
    `assets/backgrounds/${category.slug}.webp`,
    `assets/backgrounds/${category.slug}.png`,
    `assets/backgrounds/${category.slug}.svg`,
    "assets/logo.png",
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
  return `/${match || "assets/logo.png"}`;
}

const CATEGORY_CARD_IMAGE_SIZES = "(min-width: 1120px) 280px, (min-width: 800px) calc(33.333vw - 2rem), (min-width: 520px) calc(50vw - 1.5rem), calc(100vw - 2rem)";

function categoryCardImageAttributes(category) {
  const source = `assets/backgrounds_new/${category.slug}.jpg`;
  const derivative = `assets/backgrounds_new/${category.slug}-320.jpg`;
  if (fs.existsSync(path.join(root, source)) && fs.existsSync(path.join(root, derivative))) {
    return `src="/${escapeHtml(source)}" srcset="/${escapeHtml(derivative)} 320w, /${escapeHtml(source)} 640w" sizes="${CATEGORY_CARD_IMAGE_SIZES}" width="640" height="640"`;
  }

  const image = categoryImagePath(category);
  const isSquareWebp = /^\/assets\/backgrounds\/(?:fictional-worlds|linguistics|mythology-legends|superheroes|survival|tech-retro|true-crime)\.webp$/u.test(image);
  return `src="${escapeHtml(image)}" width="${isSquareWebp ? "800" : "640"}" height="${isSquareWebp ? "800" : "420"}"`;
}

function simpleCategoryCard(category, lang = "en") {
  const isAr = lang === "ar";
  const topics = (category.topics || []).slice(0, 3).map((topic) => topic[lang] || topic.en).join(" · ");
  return `<a class="category-card has-art" href="${escapeHtml(categoryRoute(category, lang))}" aria-label="${escapeHtml(category.title[lang])}">
          <div class="category-card-bg" aria-hidden="true">
            <img class="category-card-image" ${categoryCardImageAttributes(category)} alt="" loading="lazy" decoding="async" />
            <span class="category-card-count-badge">${category.count} ${isAr ? "س" : "Q"}</span>
          </div>
          <div class="category-card-overlay">
            <h3 class="category-title">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title[lang])}</h3>
            ${topics ? `<p class="category-card-topics">${escapeHtml(topics)}</p>` : ""}
          </div>
          <div class="category-card-footer">
            <span class="category-card-label">${category.count} ${isAr ? "سؤالًا" : "questions"}</span>
            <span class="category-card-enter">${isAr ? "استكشف" : "Enter"}</span>
          </div>
        </a>`;
}

function topicPaginationMarkup(category, lang, currentPage, totalPages) {
  if (totalPages <= 1) return "";
  const isAr = lang === "ar";
  const pageLinks = Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1;
    const current = pageNumber === currentPage;
    return `<a class="${current ? "primary-btn" : "ghost-btn"}" href="${escapeHtml(categoryPageRoute(category, lang, pageNumber))}"${current ? ' aria-current="page"' : ""}>${pageNumber}</a>`;
  }).join("\n          ");
  return `<nav class="seo-language-links" aria-label="${isAr ? "صفحات أسئلة الموضوع" : "Topic question pages"}">
          ${pageLinks}
        </nav>`;
}

function renderCategoryPage(category, cards, lang = "en") {
  const isAr = lang === "ar";
  const otherLang = isAr ? "en" : "ar";
  const section = sectionBySlug.get(category.slug);
  if (!section) throw new Error(`Missing section for ${category.slug}`);
  const previewCards = cards.slice(0, TOPIC_PAGE_SIZE);
  const totalPages = Math.ceil(cards.length / TOPIC_PAGE_SIZE);
  const canonical = categoryUrl(category, lang);
  const alternate = categoryUrl(category, otherLang);
  const englishCanonical = categoryUrl(category, "en");
  const localizedHome = isAr ? `${SITE_ORIGIN}/ar/` : `${SITE_ORIGIN}/`;
  const localizedMindLab = isAr ? `${SITE_ORIGIN}/ar/mind-lab/` : `${SITE_ORIGIN}/mind-lab`;
  const localizedHomeRoute = localizedSharedRoute("index.html", lang);
  const localizedMindLabRoute = localizedSharedRoute("mind-lab.html", lang);
  const localizedAboutRoute = localizedSharedRoute("about.html", lang);
  const title = isAr
    ? `اختبار ${category.title.ar}: ${category.count} سؤالًا | JAKH`
    : `${category.title.en} Quiz: ${category.count} Questions | JAKH`;
  const description = categoryMetaDescription(category, lang);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      quizStructuredData({
        canonical,
        name: isAr ? `اختبار وأسئلة ${category.title.ar}` : `${category.title.en} Quiz & Questions`,
        description,
        lang,
        subjectNames: [category.title[lang]],
        cards: previewCards,
      }),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: isAr ? "الرئيسية" : "Home", item: localizedHome },
          { "@type": "ListItem", position: 2, name: isAr ? "مختبر العقول" : "Mind Lab", item: localizedMindLab },
          {
            "@type": "ListItem",
            position: 3,
            name: section.title[lang],
            item: `${localizedMindLab}#section-${section.key}`,
          },
          { "@type": "ListItem", position: 4, name: category.title[lang], item: canonical },
        ],
      },
    ],
  };
  const diffSummary = Object.entries(category.difficultyCounts || [])
    .map(([level, count]) => {
      const labels = isAr
        ? { easy: "سهل", medium: "متوسط", hard: "صعب", "very-advanced": "صعب جدًا" }
        : { easy: "easy", medium: "medium", hard: "hard", "very-advanced": "very advanced" };
      return `${count} ${labels[level] || level.replace("-", " ")}`;
    })
    .join(" · ");
  const topics = category.topics || [];
  const related = relatedCategories(category, section);
  const professionalNote = YMYL_SLUGS.has(category.slug)
    ? `<p class="content-standards-note"><strong>${isAr ? "للاستخدام التعليمي:" : "Educational use:"}</strong> ${isAr ? "هذا الاختبار للتعلّم والترفيه، وليس نصيحة طبية أو قانونية أو مالية أو نفسية." : "This quiz is for learning and entertainment, not medical, legal, financial, or mental-health advice."} <a href="${localizedAboutRoute}#standards">${isAr ? "اطّلع على معايير المحتوى." : "Read our content standards."}</a></p>`
    : `<p class="content-standards-note">${isAr ? "نراجع الأسئلة لتكون مفيدة وممتعة." : "Questions are curated for learning and entertainment."} <a href="${localizedAboutRoute}#standards">${isAr ? "تعرّف إلى طريقة مراجعتنا لمحتوى JAKH وتحسينه." : "See how JAKH reviews and improves content."}</a></p>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
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
    <link rel="alternate" hreflang="en" href="${englishCanonical}" />
    <link rel="alternate" hreflang="ar" href="${categoryUrl(category, "ar")}" />
    <link rel="alternate" hreflang="x-default" href="${englishCanonical}" />
    ${totalPages > 1 ? `<link rel="next" href="${categoryPageUrl(category, lang, 2)}" />` : ""}
    <meta name="robots" content="index,follow,max-image-preview:large" />
${socialMeta({ title, description, url: canonical, type: "article", lang, image: categorySocialImage(category, lang) })}
    <script type="application/ld+json">
${jsonLd(structuredData)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
    <link rel="manifest" href="/manifest.webmanifest" />
${analyticsHead()}
  </head>
  <body data-page="category" data-category="${escapeHtml(category.slug)}" data-route-lang="${lang}">
    <a href="#top" class="skip-link">${isAr ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content"}</a>
    <header class="site-header shell">
      ${brandMarkup(lang, true, localizedHomeRoute)}
      <nav class="header-actions" aria-label="${isAr ? "إجراءات سريعة" : "Quick actions"}">
        <a class="ghost-btn" href="${localizedHomeRoute}" data-i18n="navHome">${isAr ? "الرئيسية" : "Home"}</a>
        <a class="ghost-btn" href="${localizedMindLabRoute}" data-i18n="navCategories">${isAr ? "المواضيع" : "Categories"}</a>
        <a class="ghost-btn language-route-link" href="${alternate}" hreflang="${otherLang}" lang="${otherLang}" dir="${isAr ? "ltr" : "rtl"}">${isAr ? "English" : "العربية"}</a>
        <button class="ghost-btn" id="openAuthBtn" data-i18n="authOpen">${isAr ? "تسجيل الدخول" : "Sign in"}</button>
      </nav>
      <div class="header-selects" aria-label="${isAr ? "إعدادات اللغة" : "Language controls"}">
        <label>
          <span data-i18n="language">${isAr ? "اللغة" : "Language"}</span>
          <select id="langSelect">
            <option value="en"${isAr ? "" : " selected"}>English</option>
            <option value="ar"${isAr ? " selected" : ""}>العربية</option>
          </select>
        </label>
      </div>
    </header>

    <main id="top">
      <nav class="page-breadcrumb shell" aria-label="${isAr ? "مسار التنقل" : "Breadcrumb"}">
        <a href="${localizedHomeRoute}">${isAr ? "الرئيسية" : "Home"}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <a href="${localizedMindLabRoute}">${isAr ? "مختبر العقول" : "Mind Lab"}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <a href="${localizedMindLabRoute}#section-${escapeHtml(section.key)}">${escapeHtml(section.title[lang])}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <span id="breadcrumbCategoryName" aria-current="page">${escapeHtml(category.title[lang])}</span>
      </nav>
      <section class="hero shell hero-category">
        <div class="hero-copy">
          <p class="eyebrow" id="categoryKicker">${escapeHtml(category.cluster[lang])}</p>
          <h1 id="categoryTitle">${escapeHtml(category.emoji || "❔")} ${escapeHtml(category.title[lang])}</h1>
          <p class="hero-text" id="categoryDescription">${escapeHtml(category.description[lang])}</p>
          <div class="hero-badges">
            <span id="categoryCountPill">${category.count} ${isAr ? "سؤالًا" : "questions"}</span>
            <span id="categoryDiffBadge">${escapeHtml(diffSummary)}</span>
          </div>
          ${professionalNote}
        </div>
        <aside class="hero-panel hero-panel-rich">
          <img class="hero-illustration" id="categoryImage" src="${escapeHtml(categoryImagePath(category))}" alt="" />
          <div class="hero-panel-head"><p data-i18n="pageProgress">${isAr ? "تقدّمك في هذا الموضوع" : "Page progress"}</p></div>
          <div id="categorySummaryMount"></div>
        </aside>
      </section>

      <section class="shell section-block" id="questionSection">
        <div class="section-heading library-head">
          <div>
            <p class="eyebrow" data-i18n="insidePageEyebrow">${isAr ? "داخل هذه الصفحة" : "Inside this page"}</p>
            <h2 data-i18n="insidePageTitle">${isAr ? "اكتشف بطاقات الموضوع كلها" : "Flip the full category set"}</h2>
          </div>
          <p class="section-note" data-i18n="insidePageText">${isAr ? "استخدم البحث، أو صفِّ البطاقات حسب الصعوبة، أو حالة الحل، أو المفضلة." : "Use search, difficulty, favorites, solved state, and show filters where available."}</p>
        </div>
        <section class="control-panel" aria-label="${isAr ? "خيارات تصفية الأسئلة" : "Question filters"}">
          <label class="search-field">
            <span data-i18n="searchThisPageLabel">${isAr ? "ابحث في هذه الصفحة" : "Search this page"}</span>
            <input id="cardSearchInput" type="search" autocomplete="off" placeholder="${isAr ? "ابحث بكلمة أو إجابة أو مفهوم..." : "Search by keyword, answer, or concept..."}" />
          </label>
          <div class="select-grid">
            <label><span data-i18n="difficultyLabel">${isAr ? "الصعوبة" : "Difficulty"}</span><select id="difficultySelect"><option value="all">${isAr ? "كل المستويات" : "All levels"}</option><option value="easy">${isAr ? "سهل" : "Easy"}</option><option value="medium">${isAr ? "متوسط" : "Medium"}</option><option value="hard">${isAr ? "صعب" : "Hard"}</option><option value="very-advanced">${isAr ? "صعب جدًا" : "Difficult"}</option></select></label>
            <label><span data-i18n="showLabel">${isAr ? "إظهار" : "Show"}</span><select id="viewSelect"><option value="all">${isAr ? "كل شيء" : "Everything"}</option><option value="unsolved">${isAr ? "غير المحلول فقط" : "Only unsolved"}</option><option value="solved">${isAr ? "المحلول فقط" : "Only solved"}</option><option value="favorites">${isAr ? "المفضلة فقط" : "Only favorites"}</option></select></label>
            <label><span data-i18n="sortLabel">${isAr ? "الترتيب" : "Sort"}</span><select id="sortSelect"><option value="featured">${isAr ? "الترتيب المقترح" : "Featured order"}</option><option value="difficulty">${isAr ? "حسب الصعوبة" : "By difficulty"}</option><option value="az">${isAr ? "أ ← ي" : "A → Z"}</option><option value="random">${isAr ? "ترتيب عشوائي" : "Shuffle now"}</option></select></label>
          </div>
          <div id="subcategoryWrap" class="subcategory-wrap">
            <p class="mini-label" data-i18n="subcategoriesLabel">${isAr ? "الموضوعات الفرعية" : "Subcategories"}</p>
            <div class="chip-row" id="subcategoryFilters">
              <button class="category-chip is-active" data-subcategory="all">${isAr ? "الكل" : "All"} · ${category.count}</button>
              ${topics.map((topic) => `<button class="category-chip" data-subcategory="${escapeHtml(topic.en)}">${escapeHtml(topic[lang] || topic.en)} · ${topic.count}</button>`).join("\n              ")}
            </div>
          </div>
        </section>
        <div class="library-toolbar">
          <p id="resultsLabel">${isAr ? `عرض جميع البطاقات وعددها ${category.count}.` : `Showing all ${category.count} cards.`}</p>
          <button class="text-btn" id="resetPageBtn" data-i18n="resetFilters">${isAr ? "مسح الفلاتر" : "Reset filters"}</button>
        </div>
        <div id="emptyState" class="empty-state hidden">
          <strong data-i18n="emptyTitle">${isAr ? "لا توجد بطاقات تطابق هذا الاختيار." : "No cards match that combination."}</strong>
          <p data-i18n="emptyText">${isAr ? "جرّب مسح أحد خيارات التصفية، أو استخدم كلمات بحث أعم." : "Try clearing a filter or broadening the search."}</p>
        </div>
        <div id="cardGrid" class="riddle-grid" aria-live="polite">
        <!-- SEO:CARDS:START -->
        ${previewCards.map((card) => staticCardMarkup(category, card, lang)).join("\n        ")}
        <!-- SEO:CARDS:END -->
        </div>
        ${topicPaginationMarkup(category, lang, 1, totalPages)}
      </section>

      <section class="shell section-block">
        <div class="section-heading library-head">
          <div><p class="eyebrow" data-i18n="relatedEyebrow">${isAr ? "واصل الاستكشاف" : "Keep exploring"}</p><h2 data-i18n="relatedTitle">${isAr ? "موضوعات قد تعجبك" : "Related category pages"}</h2></div>
          <p class="section-note" data-i18n="relatedText">${isAr ? "واصل الاستكشاف وانتقل مباشرة إلى موضوع قريب." : "Jump to nearby topics without going back to the home page."}</p>
        </div>
        <div id="relatedCategories" class="category-grid">
          ${related.map((item) => simpleCategoryCard(item, lang)).join("\n          ")}
        </div>
      </section>
    </main>

    ${globalFooter(lang, true, "", "app", true)}
    ${authModal(lang)}
    <script src="/app.js?v=${APP_ASSET_VERSION}"></script>
  </body>
</html>`;
}

function staticTopicCardMarkup(category, card, lang, position) {
  const isAr = lang === "ar";
  const label = isAr ? "الإجابة" : "Answer";
  const interactiveLabel = isAr ? "اعرض البطاقة في الاختبار التفاعلي" : "Open this card in the interactive quiz";
  return `<article class="seo-qa-card" id="${escapeHtml(card.id)}" data-id="${escapeHtml(card.id)}">
          <details>
            <summary><span class="seo-question-number">${String(position).padStart(2, "0")}</span><span>${escapeHtml(card.question[lang])}</span></summary>
            <div class="seo-answer">
              <p class="seo-answer-label">${label}</p>
              <p>${escapeHtml(card.answer[lang])}</p>
              ${staticReviewMarkup(card, lang)}
              <a href="${escapeHtml(categoryRoute(category, lang))}?card=${encodeURIComponent(card.id)}">${interactiveLabel} ${isAr ? "←" : "→"}</a>
            </div>
          </details>
        </article>`;
}

function renderCategoryPaginationPage(category, cards, lang, pageNumber) {
  const isAr = lang === "ar";
  const section = sectionBySlug.get(category.slug);
  if (!section) throw new Error(`Missing section for ${category.slug}`);
  const totalPages = Math.ceil(cards.length / TOPIC_PAGE_SIZE);
  if (pageNumber < 2 || pageNumber > totalPages) {
    throw new Error(`Invalid page ${pageNumber} for ${category.slug}`);
  }
  const startIndex = (pageNumber - 1) * TOPIC_PAGE_SIZE;
  const pageCards = cards.slice(startIndex, startIndex + TOPIC_PAGE_SIZE);
  const endPosition = startIndex + pageCards.length;
  const canonical = categoryPageUrl(category, lang, pageNumber);
  const englishAlternate = categoryPageUrl(category, "en", pageNumber);
  const arabicAlternate = categoryPageUrl(category, "ar", pageNumber);
  const localizedHomeRoute = isAr ? "/ar/" : "/";
  const localizedMindLabRoute = isAr ? "/ar/mind-lab/" : "/mind-lab";
  const localizedHome = `${SITE_ORIGIN}${localizedHomeRoute}`;
  const localizedMindLab = `${SITE_ORIGIN}${localizedMindLabRoute}`;
  const title = isAr
    ? `${category.title.ar}: الصفحة ${pageNumber} من ${totalPages} | JAKH`
    : `${category.title.en} Questions: Page ${pageNumber} of ${totalPages} | JAKH`;
  const description = isAr
    ? truncate(`الصفحة ${pageNumber} من أسئلة ${category.title.ar}: الأسئلة من ${startIndex + 1} إلى ${endPosition} مع الإجابات وحالة المراجعة التحريرية وروابط المصادر المتاحة.`, 158)
    : truncate(`Page ${pageNumber} of ${category.title.en} questions: items ${startIndex + 1}–${endPosition}, with answers, editorial review status, and available source links.`, 158);
  const pageHeading = isAr
    ? `${category.title.ar} — الصفحة ${pageNumber} من ${totalPages}`
    : `${category.title.en} — Page ${pageNumber} of ${totalPages}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      quizStructuredData({
        canonical,
        name: pageHeading,
        description,
        lang,
        subjectNames: [category.title[lang]],
        cards: pageCards,
      }),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: isAr ? "الرئيسية" : "Home", item: localizedHome },
          { "@type": "ListItem", position: 2, name: isAr ? "مختبر العقول" : "Mind Lab", item: localizedMindLab },
          {
            "@type": "ListItem",
            position: 3,
            name: section.title[lang],
            item: `${localizedMindLab}#section-${section.key}`,
          },
          {
            "@type": "ListItem",
            position: 4,
            name: category.title[lang],
            item: categoryUrl(category, lang),
          },
          {
            "@type": "ListItem",
            position: 5,
            name: isAr ? `الصفحة ${pageNumber}` : `Page ${pageNumber}`,
            item: canonical,
          },
        ],
      },
    ],
  };
  const previousUrl = categoryPageUrl(category, lang, pageNumber - 1);
  const nextUrl = pageNumber < totalPages ? categoryPageUrl(category, lang, pageNumber + 1) : "";
  const languageRoute = categoryPageRoute(category, isAr ? "en" : "ar", pageNumber);
  const pageCardsMarkup = pageCards
    .map((card, index) => staticTopicCardMarkup(category, card, lang, startIndex + index + 1))
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="en" href="${englishAlternate}" />
    <link rel="alternate" hreflang="ar" href="${arabicAlternate}" />
    <link rel="alternate" hreflang="x-default" href="${englishAlternate}" />
    <link rel="prev" href="${previousUrl}" />
${nextUrl ? `    <link rel="next" href="${nextUrl}" />` : ""}
    <meta name="robots" content="index,follow,max-image-preview:large" />
${socialMeta({ title, description, url: canonical, type: "article", lang, image: categorySocialImage(category, lang) })}
    <script type="application/ld+json">
${jsonLd(structuredData)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
${analyticsHead()}
  </head>
  <body class="seo-page" data-seo-topic="${escapeHtml(category.slug)}" data-seo-page="${pageNumber}">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    <header class="site-header shell">
      ${brandMarkup(lang, false, localizedHomeRoute)}
      <nav class="header-actions" aria-label="${isAr ? "التنقل" : "Quick actions"}">
        <a class="ghost-btn" href="${localizedHomeRoute}">${isAr ? "الرئيسية" : "Home"}</a>
        <a class="ghost-btn" href="${localizedMindLabRoute}">${isAr ? "مختبر العقول" : "Mind Lab"}</a>
        <a class="ghost-btn" href="${languageRoute}" hreflang="${isAr ? "en" : "ar"}" lang="${isAr ? "en" : "ar"}" dir="${isAr ? "ltr" : "rtl"}">${isAr ? "English" : "العربية"}</a>
      </nav>
    </header>
    <main id="content">
      <nav class="page-breadcrumb shell" aria-label="${isAr ? "مسار التنقل" : "Breadcrumb"}">
        <a href="${localizedHomeRoute}">${isAr ? "الرئيسية" : "Home"}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <a href="${localizedMindLabRoute}">${isAr ? "مختبر العقول" : "Mind Lab"}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <a href="${categoryRoute(category, lang)}">${escapeHtml(category.title[lang])}</a><span aria-hidden="true">${isAr ? "‹" : "›"}</span>
        <span aria-current="page">${isAr ? `الصفحة ${pageNumber}` : `Page ${pageNumber}`}</span>
      </nav>
      <section class="seo-collection-hero shell">
        <p class="eyebrow">${escapeHtml(category.cluster[lang])}</p>
        <h1>${escapeHtml(pageHeading)}</h1>
        <p>${isAr ? `الأسئلة من ${startIndex + 1} إلى ${endPosition} من أصل ${cards.length}.` : `Questions ${startIndex + 1}–${endPosition} of ${cards.length}.`}</p>
        <div class="hero-actions">
          <a class="primary-btn" href="${categoryRoute(category, lang)}">${isAr ? "ابدأ الاختبار الكامل" : "Open the full interactive quiz"}</a>
        </div>
      </section>
      <section class="seo-question-list shell" aria-label="${isAr ? "الأسئلة والأجوبة" : "Questions and answers"}">
        ${pageCardsMarkup}
      </section>
      <section class="seo-next-step shell">
        <h2>${isAr ? "تصفّح جميع صفحات الموضوع" : "Browse every topic page"}</h2>
        ${topicPaginationMarkup(category, lang, pageNumber, totalPages)}
      </section>
    </main>
    ${globalFooter(lang, false, "", "site", true)}
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
          ${categories.map((category) => simpleCategoryCard(category, "en")).join("\n          ")}`;
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
    "privacy",
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

function sharedLanguageAlternatesMarkup(route) {
  const en = `${SITE_ORIGIN}${route.en}`;
  const ar = `${SITE_ORIGIN}${route.ar}`;
  return `    <link rel="alternate" hreflang="en" href="${en}" />
    <link rel="alternate" hreflang="ar" href="${ar}" />
    <link rel="alternate" hreflang="x-default" href="${en}" />`;
}

function ensureSharedLanguageAlternates(source, file) {
  const route = SHARED_ROUTE_BY_FILE.get(file);
  if (!route) return source;
  const withoutExisting = source.replace(/\s*<link rel="alternate" hreflang="(?:en|ar|x-default)"[^>]*\/?>/giu, "");
  return withoutExisting.replace(
    /(<link rel="canonical"[^>]*\/?>)/iu,
    `$1\n${sharedLanguageAlternatesMarkup(route)}`,
  );
}

function normalizeAnalytics(source) {
  const scriptPattern = /[ \t]*<script\b(?:[^>"']|"[^"]*"|'[^']*')*>(?:[\s\S]*?)<\/script\s*>[ \t]*(?:\r?\n)?/giu;
  const withoutLegacyAnalytics = source.replace(scriptPattern, (block) => {
    if (/googletagmanager\.com\/gtag\/js/iu.test(block)) return "";
    if (/\bgtag\s*\(\s*["']config["']/u.test(block)) return "";
    if (/\bsrc\s*=\s*["'][^"']*privacy-consent\.js(?:\?[^"']*)?["']/iu.test(block)) return "";
    return block;
  });
  return withoutLegacyAnalytics.replace(/<\/head>/iu, `${analyticsHead()}\n  </head>`);
}

function ensureFooterLinks(source) {
  const footerLinks = `<nav class="footer-site-links" aria-label="JAKH information" data-i18n-aria-label="footerInfoLabel"><a href="/collections" data-i18n="footerCollections">Collections</a><a href="/about" data-i18n="footerAbout">About &amp; content standards</a><a href="/privacy" data-i18n="footerPrivacy">Privacy Centre</a></nav>`;
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
  if (source.includes("site-footer")) {
    return source.replace(/<\/footer>/iu, `  ${footerLinks}\n    </footer>`);
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
  next = ensureSharedLanguageAlternates(next, file);
  next = normalizeAnalytics(next);
  next = ensureFooterLinks(next);
  next = next
    .replace(/<html\s+lang="en"(?![^>]*\bdir=)([^>]*)>/iu, '<html lang="en" dir="ltr"$1>')
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

function collectionSubjectNames(collection, lang) {
  const subjects = (collection.sourceCategories || [])
    .map((source) => source.label?.[lang] || source.slug)
    .map(cleanText)
    .filter(Boolean);
  return subjects.length ? [...new Set(subjects)] : [collectionHeading(collection, lang)];
}

function collectionDisclaimer(collection, lang) {
  return collection.disclaimer?.[lang] || collection.visibleDisclaimer?.[lang] || "";
}

function collectionUrl(collection, lang) {
  return `${SITE_ORIGIN}/${lang}/${collectionSlug(collection, lang)}/`;
}

function collectionSocialImage(collection, lang) {
  for (const source of collection.sourceCategories || []) {
    const category = categoryBySlug.get(source.slug);
    if (!category) continue;
    const image = categorySocialImage(category, lang);
    if (image !== DEFAULT_SOCIAL_IMAGE) {
      return {
        ...image,
        alt: lang === "ar"
          ? `${collectionHeading(collection, lang)} على JAKH`
          : `${collectionHeading(collection, lang)} on JAKH`,
      };
    }
  }
  return DEFAULT_SOCIAL_IMAGE;
}

function renderCollectionPage(collection, lang, cards) {
  const isAr = lang === "ar";
  const otherLang = isAr ? "en" : "ar";
  const canonical = collectionUrl(collection, lang);
  const alternate = collectionUrl(collection, otherLang);
  const localizedHomeRoute = localizedSharedRoute("index.html", lang);
  const localizedCollectionsRoute = localizedSharedRoute("collections.html", lang);
  const localizedMindLabRoute = localizedSharedRoute("mind-lab.html", lang);
  const title = collectionTitle(collection, lang);
  const description = collectionDescription(collection, lang);
  const label = isAr ? "الإجابة" : "Answer";
  const sourceLabel = isAr ? "اعرض البطاقة التفاعلية" : "Open the interactive card";
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      quizStructuredData({
        canonical,
        name: title.replace(/\s*\|\s*JAKH\s*$/u, ""),
        description,
        lang,
        subjectNames: collectionSubjectNames(collection, lang),
        cards,
      }),
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
              ${staticReviewMarkup(card, lang)}
              <a href="${escapeHtml(categoryRoute(card.sourceCategory, lang))}?card=${encodeURIComponent(card.id)}">${sourceLabel} ${isAr ? "←" : "→"}</a>
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
${socialMeta({ title, description, url: canonical, type: "article", lang, image: collectionSocialImage(collection, lang) })}
    <script type="application/ld+json">
${jsonLd(structured)}
    </script>
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
${analyticsHead()}
  </head>
  <body class="seo-page">
    <a href="#content" class="skip-link">${isAr ? "انتقل إلى المحتوى" : "Skip to main content"}</a>
    <header class="site-header shell">
      ${brandMarkup(lang, false, localizedHomeRoute)}
      <nav class="header-actions" aria-label="${isAr ? "التنقل" : "Quick actions"}">
        <a class="ghost-btn" href="${localizedHomeRoute}">${isAr ? "الرئيسية" : "Home"}</a>
        <a class="ghost-btn" href="${localizedCollectionsRoute}">${isAr ? "المجموعات" : "Collections"}</a>
        <a class="ghost-btn" href="${alternate}" lang="${otherLang}" dir="${isAr ? "ltr" : "rtl"}">${isAr ? "English" : "العربية"}</a>
      </nav>
    </header>
    <main id="content">
      <section class="seo-collection-hero shell">
        <p class="eyebrow">${isAr ? "مجموعة مختارة من JAKH" : "Curated by JAKH"}</p>
        <h1>${escapeHtml(collectionHeading(collection, lang))}</h1>
        <p>${escapeHtml(collection.intro[lang])}</p>
        <div class="seo-collection-meta">
          <span>${cards.length} ${isAr ? "سؤالًا" : "questions"}</span>
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
        <p>${isAr ? "استكشف المجموعة الكاملة، وبدّل اللغة، وتابع نتيجتك في مختبر العقول." : "Explore the full library, switch languages, and track your score in the Mind Lab."}</p>
        <div class="hero-actions">
          <a class="primary-btn" href="${localizedMindLabRoute}">${isAr ? "استكشف مختبر العقول" : "Open the Mind Lab"}</a>
          <a class="ghost-btn" href="${localizedCollectionsRoute}">${isAr ? "كل المجموعات" : "All collections"}</a>
        </div>
      </section>
    </main>
    ${globalFooter(lang, false, "", "site", true)}
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
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: collectionsWithCards.length * 2,
      itemListElement: collectionsWithCards.flatMap(({ collection }, collectionIndex) =>
        ["en", "ar"].map((lang, languageIndex) => {
          const url = collectionUrl(collection, lang);
          return {
            "@type": "ListItem",
            position: collectionIndex * 2 + languageIndex + 1,
            item: {
              "@type": "WebPage",
              "@id": url,
              name: collectionHeading(collection, lang),
              url,
              inLanguage: lang,
            },
          };
        })),
    },
  };
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${SITE_ORIGIN}/collections" />
${sharedLanguageAlternatesMarkup(SHARED_ROUTE_BY_FILE.get("collections.html"))}
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
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#fffaf2" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${SITE_ORIGIN}/about" />
${sharedLanguageAlternatesMarkup(SHARED_ROUTE_BY_FILE.get("about.html"))}
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
  const entries = [];
  for (const route of SHARED_LOCALIZED_ROUTES) {
    const en = `${SITE_ORIGIN}${route.en}`;
    const ar = `${SITE_ORIGIN}${route.ar}`;
    const alternates = { en, ar, "x-default": en };
    entries.push(sitemapUrl(en, route.priority, alternates));
    entries.push(sitemapUrl(ar, route.priority, alternates));
  }
  for (const category of catalog.categories || []) {
    const cards = JSON.parse(fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"));
    const totalPages = Math.ceil(cards.length / TOPIC_PAGE_SIZE);
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const en = categoryPageUrl(category, "en", pageNumber);
      const ar = categoryPageUrl(category, "ar", pageNumber);
      const alternates = { en, ar, "x-default": en };
      entries.push(sitemapUrl(en, pageNumber === 1 ? "0.85" : "0.75", alternates));
      entries.push(sitemapUrl(ar, pageNumber === 1 ? "0.85" : "0.75", alternates));
    }
  }
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
  emit(`${category.slug}.html`, renderCategoryPage(category, cards, "en"));
  emit(`ar/topics/${category.slug}/index.html`, renderCategoryPage(category, cards, "ar"));
  const totalPages = Math.ceil(cards.length / TOPIC_PAGE_SIZE);
  for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
    emit(`${category.slug}/page/${pageNumber}/index.html`, renderCategoryPaginationPage(category, cards, "en", pageNumber));
    emit(`ar/topics/${category.slug}/page/${pageNumber}/index.html`, renderCategoryPaginationPage(category, cards, "ar", pageNumber));
  }
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
  + `${catalog.categories.length * 2} localized interactive category pages plus crawlable pagination, ${SEO_COLLECTIONS.length * 2} localized collections, `
  + `${GAME_SLUGS.length} games.`,
);
