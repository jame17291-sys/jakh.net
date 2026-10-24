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
- **Search Console was not set up for this site** until 23 Oct 2026. The
  owner's account had `https://riddlearabia.com/` only as an *unverified*
  URL-prefix property, so it showed no data and accepted no indexing requests.
  The existing `google-site-verification` TXT record on `riddlearabia.com`
  does not match the owner's account (an earlier attempt or another account).
- **Verified on 23 Oct 2026** with the committed file
  `google6e7af92aa1edc1f2.html` (exact one-line Google payload; the edge serves
  it with `noindex` and keeps it out of the sitemap), released from `main` at
  `55bd77b3`. **Do not delete it**: Search Console re-checks it, and removing it
  unverifies the property.
- First Search Console reading after verification (23 Oct 2026):
  - **Sitemap:** `/sitemap.xml` read the same day, *Success*, 1,176 pages
    discovered.
  - **Pages report:** 295 pages indexed. 881 are *Discovered – currently not
    indexed*: Google knows them but has not crawled them yet, which is normal
    for a young domain with few links. 48 carry `noindex`; this list was not
    reviewed page by page.
  - **Indexing requested** for `/ar/`, `/ar/alghaz/`, `/ar/alghaz-arabiya/`,
    `/ar/malumat-amma/`, `/ar/alghaz-atfal/` and `/ar/alghaz-mantiq/`. All six
    were already indexed; the request asks Google to re-crawl the expanded
    collections and the new share preview.

### jakh.net is a separate site

Since 12 Oct 2026 `jakh.net` belongs to the JAKH ERP site. Its Search Console
domain property `jakh.net` belongs to that project, so leave it alone. Cleanup
done on 23 Oct 2026 so that old Riddle Arabia addresses on `jakh.net` stop
appearing in Google:

- Temporary removal requests (about six months, by prefix) for the old riddle
  addresses Google still listed: `/psychology`, `/science`, `/collections`,
  `/architecture-and-landmarks`, `/infrastructure-systems`, `/ar/topics/`,
  `/ar/ikhtibar-qawanin-korat-alqadam/` and `/en/riddles-with-answers/`. None
  of these prefixes covers an ERP sitemap page. The old addresses already return
  404 with `noindex`, so Google drops them permanently as it re-crawls.
- The stale `https://www.jakh.net/sitemap.xml` entry (last read June 2026) was
  removed from that property. The ERP sitemap `https://jakh.net/sitemap.xml` was
  read on 23 Oct 2026 with 58 pages.
- Left for the owner to remove by hand, because the tools could not do it:
  - the `https://www.jakh.net/` URL-prefix property, added in May 2026 while
    that address served Riddle Arabia; the `jakh.net` domain property already
    covers it;
  - the Cloudflare rate-limiting rule *Protect API authentication* on the
    `jakh.net` zone. It matches `/api/auth/*`, the Riddle Arabia API's sign-in
    paths, which do not exist on the ERP site.
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
   verified by the committed HTML file above (done 23 Oct 2026). Optionally
   also add a *Domain* property for `riddlearabia.com` with a DNS TXT record
   from the same account, to include `www` and every protocol in one report.
2. In Search Console, check **Sitemaps** (it showed *Success* on 23 Oct 2026).
   Then read **Pages** (why pages are not indexed) and **Performance →
   Queries** (what people already search to find the site).
3. Use **URL inspection → Request indexing** after large content changes.
   There is a daily quota. The six Arabic landing pages were requested on
   23 Oct 2026; the English landing pages (riddles, Arabic riddles, family
   riddles, general knowledge, brain games, play, daily) are next.
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
