# Search discovery: getting riddlearabia.com found

Status checked on 23 Oct 2026 (live site, a signed-in Google session in the
UAE, so positions may be personalised):

- The site is healthy: production monitor green, pages fast, canonical and
  `hreflang` tags correct, nothing blocks crawlers.
- **Google** has indexed it (several result pages for `site:riddlearabia.com`,
  including the Arabic home). It is first for the brand ("riddle arabia",
  "ريدل ارابيا") and about fourth for "arabic riddles with answers", but it is
  not on the first page for "الغاز مع الحل", the Arabic query where most of
  the audience searches.
- **Bing has no pages from the site.** That also means DuckDuckGo, Yahoo,
  Ecosia and assistants that search through Bing cannot find it. Nothing in the
  repository ever submitted the site to Bing or IndexNow.
- **Search Console was not set up for this site.** The owner's account had
  `https://riddlearabia.com/` only as an *unverified* URL-prefix property, so
  it showed no data and accepted no indexing requests. The verified properties
  in that account, `jakh.net` and `www.jakh.net`, belong to the JAKH ERP
  site since 12 Oct 2026; leave them to that project. The existing
  `google-site-verification` TXT record on `riddlearabia.com` does not match
  the owner's account (an earlier attempt or another account).
- Verification now uses the committed file `google6e7af92aa1edc1f2.html`
  (exact one-line Google payload; the edge serves it with `noindex` and keeps
  it out of the sitemap). **Do not delete it**: Search Console re-checks it,
  and removing it unverifies the property.
- The domain only went live on 16 Sep 2026. On 12 Oct 2026 `jakh.net` went to
  an unrelated project, so links or rankings earned there no longer lead here.

## Automated in this repository

- `<key>.txt` at the repository root is the public IndexNow key (32 hex
  characters; the file contains its own name). It is public by design and is
  not a secret.
- `scripts/submit-indexnow.mjs` reads `sitemap.xml`, checks that the key is
  live on production, and submits URLs to `api.indexnow.org`. That reaches
  Bing, Yandex, Naver, Seznam and every IndexNow partner. Bing results also
  feed DuckDuckGo, Yahoo and Ecosia.
- `.github/workflows/search-submit.yml` runs it after every successful static
  release, sending only pages whose sitemap `<lastmod>` changed in the last
  three days. Run it manually from the Actions tab with scope `all` once after
  the key file first reaches production, and after large content releases.

Google ignores IndexNow and retired its sitemap ping, so Google needs the owner
steps below.

## Owner steps (accounts only the owner can use)

1. **Google Search Console** (https://search.google.com/search-console).
   Select the `https://riddlearabia.com/` property, not `jakh.net`. It is
   verified by the committed HTML file above. Optionally also add a *Domain*
   property for `riddlearabia.com` with a DNS TXT record from the same
   account, to include `www` and every protocol in one report.
2. In Search Console, check **Sitemaps**. If `https://riddlearabia.com/sitemap.xml`
   is not listed as *Success*, submit it. Then read **Pages** (why pages are
   not indexed) and **Performance → Queries** (what people already search to
   find the site).
3. Use **URL inspection → Request indexing** for the homepage, `/ar/` and the
   main landing pages (riddles, Arabic riddles, family riddles, general
   knowledge, brain games, play, daily). There is a daily quota, so start with
   the Arabic pages.
4. *Optional, low priority:* **Bing Webmaster Tools**. Google carries almost
   all search in the target region; IndexNow already notifies Bing
   automatically after each release.
5. **Earn the first links.** Search engines find new domains mostly through
   links. Put `https://riddlearabia.com/ar/` in the bio of every social
   account, share real puzzles in WhatsApp groups and channels, and ask
   friendly sites, school or parent communities and Arabic puzzle communities
   to link to the Arabic pages. Never buy links.
6. **Measure real visitors.** Search Console shows real search impressions and
   clicks, with bots excluded, after a few days. On-site analytics stays
   consent-gated by design (`docs/FREE-FIRST-GROWTH.md`).

## What to expect

After verification and sitemap submission, Google usually crawls within days.
Indexing and ranking for competitive Arabic terms takes weeks to months and
depends on links and usefulness. Track progress in Search Console *Pages*
(indexed count) and *Performance* (impressions, clicks, queries).
