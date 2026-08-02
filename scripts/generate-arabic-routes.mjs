import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const SITE_ORIGIN = "https://jakh.net";
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

const PAGE_ROUTES = [
  {
    source: "index.html",
    output: "ar/index.html",
    englishPath: "/",
    arabicPath: "/ar/",
    runtime: "app",
    title: "JAKH: ألغاز واختبارات مجانية بالعربية والإنجليزية",
    description: "العب 3,553 لغزاً واختباراً مجانياً بالعربية والإنجليزية ضمن 56 موضوعاً، إضافة إلى 10 ألعاب متصفح. اكشف الإجابات وتابع نتيجتك.",
  },
  {
    source: "mind-lab.html",
    output: "ar/mind-lab/index.html",
    englishPath: "/mind-lab",
    arabicPath: "/ar/mind-lab/",
    runtime: "app",
    title: "مختبر العقل: 56 موضوع ألغاز وأسئلة | JAKH",
    description: "استكشف 3,553 لغزاً واختباراً ثنائي اللغة موزعة مباشرة على 56 موضوعاً ضمن 5 أقسام واضحة. اختر موضوعاً واقلب البطاقات وتابع نتيجتك.",
  },
  {
    source: "collections.html",
    output: "ar/collections/index.html",
    englishPath: "/collections",
    arabicPath: "/ar/collections/",
    runtime: "site",
    page: "collections",
    title: "مجموعات ألغاز واختبارات بالعربية والإنجليزية | JAKH",
    description: "استكشف مجموعات JAKH المختارة من الألغاز وأسئلة الأطفال والمنطق والمعلومات العامة وكرة القدم وذكريات سبيستون بالعربية والإنجليزية.",
  },
  {
    source: "play.html",
    output: "ar/play/index.html",
    englishPath: "/play",
    arabicPath: "/ar/play/",
    runtime: "app",
    title: "10 ألعاب متصفح مجانية | JAKH",
    description: "العب 10 ألعاب متصفح مجانية على JAKH: الشطرنج وغو وريفيرسي وماسترمايند وكاتان لايت وطاولة الزهر وسِت وهانابي وكودنيمز ودبلوماسي.",
  },
  {
    source: "about.html",
    output: "ar/about/index.html",
    englishPath: "/about",
    arabicPath: "/ar/about/",
    runtime: "site",
    page: "about",
    title: "عن JAKH ومعايير المحتوى",
    description: "تعرّف إلى طريقة تنظيم JAKH ومراجعة وترجمة وتحسين 3,553 سؤالاً ثنائي اللغة، وكيفية الإبلاغ عن تصحيح.",
  },
  {
    source: "privacy.html",
    output: "ar/privacy/index.html",
    englishPath: "/privacy",
    arabicPath: "/ar/privacy/",
    runtime: "privacy",
    title: "مركز الخصوصية | JAKH",
    description: "تحكّم في القياس، ونزّل بيانات حساب JAKH، واحذف حسابك نهائياً، واقرأ إشعار الخصوصية ثنائي اللغة.",
  },
  ...GAME_SLUGS.map((slug) => ({
    source: `${slug}.html`,
    output: `ar/games/${slug}/index.html`,
    englishPath: `/${slug}`,
    arabicPath: `/ar/games/${slug}/`,
    runtime: "game",
    game: slug,
  })),
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function extractObject(source, marker, label) {
  const markerIndex = typeof marker === "string" ? source.indexOf(marker) : source.search(marker);
  if (markerIndex < 0) throw new Error(`${label}: translation marker was not found`);
  const start = source.indexOf("{", markerIndex);
  if (start < 0) throw new Error(`${label}: translation object has no opening brace`);

  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(start, index + 1);
        return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1_000 });
      }
    }
  }
  throw new Error(`${label}: translation object is not balanced`);
}

function extractGameTranslations(source, slug) {
  const registration = new RegExp(`JakhGameI18n\\.register\\(\\s*["']${slug}["']\\s*,`, "u");
  const scripts = source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/giu);
  for (const match of scripts) {
    const attributes = match[1] || "";
    const code = match[2] || "";
    if (/type=["']application\/ld\+json["']/iu.test(attributes) || !registration.test(code)) continue;
    let captured = null;
    const sandbox = {
      JakhGameI18n: {
        register(id, translations) {
          if (id === slug) captured = translations;
        },
      },
    };
    vm.runInNewContext(code, sandbox, { timeout: 1_000 });
    if (captured) return captured;
  }
  throw new Error(`${slug}.html: registration translations were not found`);
}

const appMessages = extractObject(read("app.js"), "const UI =", "app.js").ar;
const siteI18n = read("site-i18n.js");
const siteCommon = extractObject(siteI18n, "const COMMON =", "site-i18n.js COMMON").ar;
const sitePages = extractObject(siteI18n, "const PAGES =", "site-i18n.js PAGES");
const gameCommon = extractObject(read("game-i18n.js"), "var COMMON =", "game-i18n.js COMMON").ar;
const privacyMessages = extractObject(read("privacy-page.js"), "const copy =", "privacy-page.js copy").ar;
const catalog = JSON.parse(read("data/catalog.json"));
const categoriesBySlug = new Map((catalog.categories || []).map((category) => [category.slug, category]));
const sectionsByKey = new Map((catalog.sections || []).map((section) => [section.key, section]));

function messagesFor(route, source) {
  if (route.runtime === "app") return appMessages;
  if (route.runtime === "site") return { ...siteCommon, ...(sitePages[route.page]?.ar || {}) };
  if (route.runtime === "game") return { ...gameCommon, ...extractGameTranslations(source, route.game).ar };
  if (route.runtime === "privacy") return privacyMessages;
  return {};
}

function replaceAttribute(tag, attribute, value) {
  const encoded = escapeAttribute(value);
  const matcher = new RegExp(`\\s${attribute}=(?:"[^"]*"|'[^']*')`, "iu");
  if (matcher.test(tag)) return tag.replace(matcher, ` ${attribute}="${encoded}"`);
  return tag.replace(
    /\s*(\/?)>$/u,
    (_closing, selfClosing) => ` ${attribute}="${encoded}"${selfClosing ? " />" : ">"}`,
  );
}

function localizeDataAttributes(html, messages) {
  html = html.replace(
    /(<([a-z][\w:-]*)\b[^>]*\bdata-i18n=(['"])([^'"]+)\3[^>]*>)([\s\S]*?)(<\/\2>)/giu,
    (match, opening, tagName, quote, key, content, closing) => {
      const value = messages[key];
      return typeof value === "string" ? `${opening}${escapeHtml(value)}${closing}` : match;
    },
  );
  html = html.replace(
    /(<([a-z][\w:-]*)\b[^>]*\bdata-i18n-html=(['"])([^'"]+)\3[^>]*>)([\s\S]*?)(<\/\2>)/giu,
    (match, opening, tagName, quote, key, content, closing) => {
      const value = messages[key];
      return typeof value === "string" ? `${opening}${value}${closing}` : match;
    },
  );
  html = html.replace(/<[a-z][^>]*\bdata-i18n-(?:aria-label|title|placeholder)=(?:"[^"]*"|'[^']*')[^>]*>/giu, (tag) => {
    const mappings = [
      ["data-i18n-aria-label", "aria-label"],
      ["data-i18n-title", "title"],
      ["data-i18n-placeholder", "placeholder"],
    ];
    let localized = tag;
    for (const [dataAttribute, targetAttribute] of mappings) {
      const key = localized.match(new RegExp(`${dataAttribute}=(?:"([^"]+)"|'([^']+)')`, "iu"));
      if (!key) continue;
      const value = messages[key[1] || key[2]];
      if (typeof value === "string") localized = replaceAttribute(localized, targetAttribute, value);
    }
    return localized;
  });
  return html;
}

function replaceMetaContent(html, selector, value) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matcher = new RegExp(`<meta\\b(?=[^>]*\\b(?:name|property)=["']${escapedSelector}["'])[^>]*>`, "iu");
  if (!matcher.test(html)) return html;
  return html.replace(matcher, (tag) => replaceAttribute(tag, "content", value));
}

function setRouteLanguage(html) {
  html = html.replace(/<html\b[^>]*>/iu, (tag) => {
    let updated = replaceAttribute(tag, "lang", "ar");
    updated = replaceAttribute(updated, "dir", "rtl");
    return updated;
  });
  return html.replace(/<body\b[^>]*>/iu, (tag) => replaceAttribute(tag, "data-route-lang", "ar"));
}

function setMetadata(html, route, title, description) {
  const canonical = `${SITE_ORIGIN}${route.arabicPath}`;
  const english = `${SITE_ORIGIN}${route.englishPath}`;
  html = html.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${escapeHtml(title)}</title>`);
  html = replaceMetaContent(html, "description", description);
  html = replaceMetaContent(html, "og:title", title);
  html = replaceMetaContent(html, "og:description", description);
  html = replaceMetaContent(html, "og:url", canonical);
  html = replaceMetaContent(html, "og:locale", "ar_AE");
  html = replaceMetaContent(html, "og:locale:alternate", "en_US");
  html = replaceMetaContent(html, "og:image:alt", "JAKH — 3,553 لغزاً ثنائي اللغة ضمن 56 موضوعاً و10 ألعاب");
  html = replaceMetaContent(html, "twitter:title", title);
  html = replaceMetaContent(html, "twitter:description", description);
  html = replaceMetaContent(html, "twitter:image:alt", "JAKH — 3,553 لغزاً ثنائي اللغة ضمن 56 موضوعاً و10 ألعاب");

  if (!/<meta\b(?=[^>]*\bproperty=["']og:locale["'])[^>]*>/iu.test(html)) {
    html = html.replace(
      /(<meta\b(?=[^>]*\bproperty=["']og:site_name["'])[^>]*>)/iu,
      `$1\n    <meta property="og:locale" content="ar_AE" />\n    <meta property="og:locale:alternate" content="en_US" />`,
    );
  } else if (!/<meta\b(?=[^>]*\bproperty=["']og:locale:alternate["'])[^>]*>/iu.test(html)) {
    html = html.replace(
      /(<meta\b(?=[^>]*\bproperty=["']og:locale["'])[^>]*>)/iu,
      `$1\n    <meta property="og:locale:alternate" content="en_US" />`,
    );
  }

  html = html.replace(/\s*<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhreflang=)[^>]*>/giu, "");
  const alternates = [
    `    <link rel="alternate" hreflang="en" href="${english}" />`,
    `    <link rel="alternate" hreflang="ar" href="${canonical}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${english}" />`,
  ].join("\n");
  const canonicalMatcher = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/iu;
  if (!canonicalMatcher.test(html)) throw new Error(`${route.source}: canonical link is missing`);
  html = html.replace(canonicalMatcher, (tag) => `${replaceAttribute(tag, "href", canonical)}\n${alternates}`);
  return html;
}

function localizeStructuredData(html, route, title, description) {
  const canonical = `${SITE_ORIGIN}${route.arabicPath}`;
  return html.replace(
    /(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/giu,
    (match, opening, jsonSource, closing) => {
      let data;
      try {
        data = JSON.parse(jsonSource);
      } catch {
        return match;
      }
      const updatePage = (node) => {
        if (!node || typeof node !== "object" || Array.isArray(node)) return;
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (types.some((type) => ["WebPage", "CollectionPage", "AboutPage"].includes(type))) {
          node.url = canonical;
          if (typeof node["@id"] === "string" && /#webpage$/u.test(node["@id"])) node["@id"] = `${canonical}#webpage`;
          node.name = title;
          node.description = description;
          node.inLanguage = "ar";
        }
        if (types.includes("ItemList") && route.runtime === "app" && route.arabicPath === "/ar/play/") {
          node.name = "ألعاب متصفح مجانية من JAKH";
          for (const entry of node.itemListElement || []) {
            const englishUrl = entry?.url || entry?.item?.url;
            if (typeof englishUrl !== "string") continue;
            const pathname = new URL(englishUrl, SITE_ORIGIN).pathname.replace(/\/$/u, "") || "/";
            const arabicPath = sharedArabicRoutes.get(pathname);
            if (arabicPath && entry.url) entry.url = `${SITE_ORIGIN}${arabicPath}`;
            if (arabicPath && entry.item?.url) entry.item.url = `${SITE_ORIGIN}${arabicPath}`;
          }
        }
      };
      if (Array.isArray(data?.["@graph"])) data["@graph"].forEach(updatePage);
      else updatePage(data);
      return `${opening}\n${JSON.stringify(data, null, 2).replaceAll("</", "<\\/")}\n    ${closing}`;
    },
  );
}

function normalizeResourcePaths(html) {
  const replacements = [
    [/(\b(?:src|href|srcset)=["'])assets\//giu, "$1/assets/"],
    [/(\bsrc=["'])game-i18n\.js/giu, "$1/game-i18n.js"],
    [/(\bsrc=["'])app\.js/giu, "$1/app.js"],
    [/(\bsrc=["'])site-i18n\.js/giu, "$1/site-i18n.js"],
    [/(\bsrc=["'])privacy-(?:consent|page)\.js/giu, (match) => match.replace('="', '="/').replace("='", "='/")],
    [/(\bhref=["'])styles\.css/giu, "$1/styles.css"],
    [/(\bhref=["'])privacy\.css/giu, "$1/privacy.css"],
    [/(\bhref=["'])manifest\.webmanifest/giu, "$1/manifest.webmanifest"],
  ];
  for (const [matcher, replacement] of replacements) html = html.replace(matcher, replacement);
  return html;
}

const sharedArabicRoutes = new Map(PAGE_ROUTES.map((route) => [route.englishPath, route.arabicPath]));
sharedArabicRoutes.set("/index.html", "/ar/");
for (const route of PAGE_ROUTES) {
  if (route.englishPath !== "/") sharedArabicRoutes.set(`${route.englishPath}.html`, route.arabicPath);
}
for (const slug of categoriesBySlug.keys()) {
  sharedArabicRoutes.set(`/${slug}`, `/ar/topics/${slug}/`);
  sharedArabicRoutes.set(`/${slug}.html`, `/ar/topics/${slug}/`);
}

function splitInternalUrl(value) {
  const match = String(value).match(/^([^?#]*)(\?[^#]*)?(#.*)?$/u);
  if (!match) return null;
  return { pathname: match[1], search: match[2] || "", hash: match[3] || "" };
}

function stripRetiredLanguage(search) {
  if (!search) return "";
  const params = new URLSearchParams(search.slice(1));
  params.delete("lang");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function localizeInternalLinks(html) {
  html = html.replace(/<a\b(?=[^>]*\bdata-href-ar=(?:"[^"]+"|'[^']+'))[^>]*>/giu, (tag) => {
    const value = tag.match(/\bdata-href-ar=(?:"([^"]+)"|'([^']+)')/iu);
    return value ? replaceAttribute(tag, "href", value[1] || value[2]) : tag;
  });
  return html.replace(/\bhref=(['"])([^'"]+)\1/giu, (attribute, quote, value) => {
    if (!value.startsWith("/") || value.startsWith("//")) return attribute;
    const parts = splitInternalUrl(value);
    if (!parts) return attribute;
    const target = sharedArabicRoutes.get(parts.pathname.replace(/\/$/u, "") || "/")
      || sharedArabicRoutes.get(parts.pathname);
    if (!target) return attribute;
    return `href=${quote}${target}${stripRetiredLanguage(parts.search)}${parts.hash}${quote}`;
  });
}

function localizePrivacyOptions(html) {
  return html.replace(/<option\b(?=[^>]*\bdata-label-ar=(?:"[^"]+"|'[^']+'))[^>]*>[\s\S]*?<\/option>/giu, (option) => {
    const value = option.match(/\bdata-label-ar=(?:"([^"]+)"|'([^']+)')/iu);
    return value ? option.replace(/>[\s\S]*<\/option>$/iu, `>${escapeHtml(value[1] || value[2])}</option>`) : option;
  });
}

function annotateLanguageOptions(html) {
  return html.replace(/<option\b[^>]*\bvalue=(['"])(en|ar)\1[^>]*>/giu, (option, quote, lang) => {
    let annotated = replaceAttribute(option, "lang", lang);
    annotated = replaceAttribute(annotated, "dir", lang === "ar" ? "rtl" : "ltr");
    return annotated;
  });
}

function replaceInnerByClass(block, className, value) {
  const matcher = new RegExp(`(<([a-z][\\w:-]*)\\b[^>]*\\bclass=(['"])[^'"]*\\b${className}\\b[^'"]*\\3[^>]*>)[\\s\\S]*?(<\\/\\2>)`, "iu");
  return block.replace(matcher, (match, opening, tagName, quote, closing) => `${opening}${escapeHtml(value)}${closing}`);
}

function localizeMindLabDirectory(html) {
  for (const [slug, category] of categoriesBySlug) {
    const cardMatcher = new RegExp(
      `<a\\b(?=[^>]*\\bclass=(?:"[^"]*\\bcategory-card\\b[^"]*"|'[^']*\\bcategory-card\\b[^']*'))(?=[^>]*\\bhref=(?:"/${slug}(?:\\.html)?"|'/${slug}(?:\\.html)?'))[^>]*>[\\s\\S]*?<\\/a>`,
      "iu",
    );
    html = html.replace(cardMatcher, (card) => {
      const title = category.title?.ar || category.title?.en || slug;
      const topics = (category.topics || [])
        .slice(0, 3)
        .map((topic) => topic.ar || topic.en)
        .filter(Boolean)
        .join(" · ");
      let localized = card.replace(/\bhref=(['"])[^'"]+\1/iu, `href="/ar/topics/${slug}/"`);
      localized = replaceAttribute(localized, "aria-label", title);
      localized = replaceInnerByClass(localized, "category-title", `${category.emoji || ""} ${title}`.trim());
      if (topics) localized = replaceInnerByClass(localized, "category-card-topics", topics);
      localized = replaceInnerByClass(localized, "category-card-count-badge", `${category.count} سؤال`);
      localized = replaceInnerByClass(localized, "category-card-label", `${category.count} سؤال`);
      localized = replaceInnerByClass(localized, "category-card-enter", "استكشف");
      return localized;
    });
  }

  for (const [key, section] of sectionsByKey) {
    const categories = (section.members || []).map((slug) => categoriesBySlug.get(slug)).filter(Boolean);
    const questionCount = categories.reduce((total, category) => total + Number(category.count || 0), 0);
    const sectionMatcher = new RegExp(`<section\\b(?=[^>]*\\bid=["']section-${key}["'])[^>]*>[\\s\\S]*?<\\/section>`, "iu");
    html = html.replace(sectionMatcher, (block) => {
      let localized = block.replace(/(<h3>)[\s\S]*?(<\/h3>)/iu, `$1${escapeHtml(section.title?.ar || section.title?.en || key)}$2`);
      localized = localized.replace(/(<div><h3>[\s\S]*?<\/h3><p>)[\s\S]*?(<\/p><\/div>)/iu, `$1${escapeHtml(section.description?.ar || section.description?.en || "")}$2`);
      localized = replaceInnerByClass(localized, "directory-section-count", `${categories.length} موضوعًا · ${questionCount} سؤال`);
      return localized;
    });
  }

  const tabTitles = new Map([["all", "كل المواضيع"], ...[...sectionsByKey].map(([key, section]) => [key, section.title?.ar || section.title?.en || key])]);
  for (const [key, title] of tabTitles) {
    const tabMatcher = new RegExp(`<button\\b(?=[^>]*\\bdata-cluster=["']${key}["'])[^>]*>[\\s\\S]*?<\\/button>`, "iu");
    html = html.replace(tabMatcher, (block) => {
      const count = key === "all" ? categoriesBySlug.size : (sectionsByKey.get(key)?.members || []).length;
      let localized = replaceAttribute(block, "aria-label", title);
      localized = replaceInnerByClass(localized, "ml-cluster-tab-name", title);
      localized = replaceInnerByClass(localized, "ml-cluster-tab-count", `${count} موضوعًا`);
      return localized;
    });
  }
  return html;
}

function renderRoute(route) {
  const source = read(route.source);
  const translations = messagesFor(route, source);
  const title = route.title || translations.metaTitle;
  const description = route.description || translations.metaDescription;
  if (!title || !description) throw new Error(`${route.source}: Arabic title and description are required`);

  let html = source;
  html = setRouteLanguage(html);
  html = setMetadata(html, route, title, description);
  html = localizeStructuredData(html, route, title, description);
  html = localizeDataAttributes(html, translations);
  if (route.arabicPath === "/ar/mind-lab/") html = localizeMindLabDirectory(html);
  if (route.runtime === "privacy") html = localizePrivacyOptions(html);
  html = annotateLanguageOptions(html);
  html = normalizeResourcePaths(html);
  html = localizeInternalLinks(html);
  return html.endsWith("\n") ? html : `${html}\n`;
}

const stale = [];
let written = 0;
for (const route of PAGE_ROUTES) {
  const content = renderRoute(route);
  const target = path.join(root, route.output);
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (current === content) continue;
  if (checkOnly) {
    stale.push(route.output);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  written += 1;
}

if (stale.length) {
  console.error(`Arabic shared routes are stale or missing (${stale.length}):`);
  for (const relativePath of stale) console.error(`- ${relativePath}`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`Arabic shared routes are current (${PAGE_ROUTES.length} pages).`);
} else {
  console.log(`Generated ${written} changed Arabic shared routes (${PAGE_ROUTES.length} total).`);
}
