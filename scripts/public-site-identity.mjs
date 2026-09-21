export const PRIMARY_SITE_ORIGIN = "https://riddlearabia.com";
export const PRIMARY_WWW_SITE_ORIGIN = "https://www.riddlearabia.com";
export const PRIMARY_API_ORIGIN = "https://api.riddlearabia.com";

const REPOSITORY_URL = "https://github.com/jame17291-sys/jakh.net";
const REPOSITORY_PLACEHOLDER = "__RIDDLE_ARABIA_REPOSITORY_URL__";

/**
 * Rewrites public copy and absolute URLs at the publish boundary. Technical
 * JAKH identifiers (database bindings, cookie names, Worker names, and
 * source-graph placeholders) intentionally remain unchanged so this is a
 * hostname/brand migration rather than a risky data migration.
 */
export function rewritePublicSiteIdentity(source) {
  return String(source)
    .replaceAll(REPOSITORY_URL, REPOSITORY_PLACEHOLDER)
    .replace(/<source\b(?=[^>]*\bsrcset=(?:"|')[^"']*assets\/logo\.webp)(?=[^>]*\btype=(?:"|')image\/webp)[^>]*\/?\s*>/giu, "")
    .replaceAll("assets/logo.webp", "assets/riddlearabia-logo.webp")
    .replaceAll("assets/logo.png", "assets/riddlearabia-logo.webp")
    .replaceAll("assets/riddlearabia-mark.svg", "assets/riddlearabia-logo.webp")
    .replaceAll("assets/og-image.jpg", "assets/riddlearabia-og-image-v2.png")
    .replaceAll("wss://api.jakh.net", "wss://api.riddlearabia.com")
    .replaceAll("https://api.jakh.net", PRIMARY_API_ORIGIN)
    .replaceAll("https://www.jakh.net", PRIMARY_WWW_SITE_ORIGIN)
    .replaceAll("https://jakh.net", PRIMARY_SITE_ORIGIN)
    .replaceAll("www.jakh.net", "www.riddlearabia.com")
    .replaceAll("jakh.net", "riddlearabia.com")
    .replace(/\bJAKH\.NET\b/gu, "RIDDLE ARABIA")
    .replace(/\bJAKH Riddles\b/gu, "Riddle Arabia")
    .replace(/\bJAKH\b/gu, "Riddle Arabia")
    .replaceAll(REPOSITORY_PLACEHOLDER, REPOSITORY_URL);
}

export function isPublicSiteIdentityTextFile(relativePath) {
  return /\.(?:html|js|json|mjs|txt|webmanifest|xml)$/iu.test(String(relativePath));
}
