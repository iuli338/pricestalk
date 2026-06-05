# Scraping study — RO market sites

Test query: `rtx 4060 laptop`. Library: `requests` + `BeautifulSoup` (no browser).

## TL;DR

| Site | Plain `requests`? | Search URL | Verdict |
|------|-------------------|-----------|---------|
| **eMAG** | ✅ works (200, full HTML) | `https://www.emag.ro/search/{query}` | **Primary source.** Server-rendered cards, clean selectors. |
| **Compari.ro** | ✅ works (Cloudflare passed) | `https://www.compari.ro/CategorySearch.php?st={query}` | **Good secondary.** Aggregator; server-rendered. Links are redirect jumps. |
| **Altex** | ✅ via **JSON API** + `curl_cffi` | `https://fenrir.altex.ro/v2/catalog/search/{query}?size=48` | **Best of the three.** Clean JSON: name, price, sku, url_key, stock. No HTML parsing. Needs `curl_cffi` (TLS block on the host). |

## Critical gotcha (cost us time, fix in real scraper)

`Accept-Encoding: br` (Brotli) **corrupts every response** because the `brotli`
package is not installed — `requests` advertises br, the server compresses with
br, and `r.text` returns undecodable bytes (looks like a "guard page").
**Fix:** either `pip install brotli`, or never send `br`. The current
`scraper.py` does not send `br`, so it's fine — but worth a pinned note.

## eMAG

- **Search URL:** `https://www.emag.ro/search/{quote_plus(query)}`
- Server-rendered. ~78 real product cards per page (156 incl. duplicates/sponsored).
- **Selectors (verified):**
  - card container: `div.card-item` (also `div.card-v2`)
  - title: **`a.card-v2-title`** — NOTE: the first `a.js-product-url` is the
    thumbnail and its text is a badge like "Smart Deals". Our current scraper's
    title selector grabs the badge — **bug to fix**: prefer `a.card-v2-title`.
  - price: `p.product-new-price` → e.g. `"7.160 , 63 Lei"` (RO format; clean the
    spaces around the comma → `7160.63`)
  - stable ids on card: `data-product-id`, `data-offer-id`, `data-category-id`
  - product URL is absolute and contains `/pd/<CODE>/`
- DataDome + captcha scripts are present in the page but load passively; plain
  GET still returns full results. May rate-limit aggressive scraping → add delays
  + a real UA + reuse a session.

## Compari.ro

- **Search URL:** `https://www.compari.ro/CategorySearch.php?st={quote_plus(query)}`
  (the homepage search form posts to `CategorySearch.php`, input name `st`).
- Behind Cloudflare but a normal session passes (warm cookies by hitting the
  homepage first). 200, server-rendered.
- It is a **price-comparison aggregator**, not a shop. Each result is the
  cheapest offer across merchants.
- **We only need the price from Compari** — use it as a price-signal source, not
  a listing source. Extract `.price` (+ `.name` to match the query); ignore the
  `Jump.php` redirect link and merchant. No need to resolve the redirect.
- **Selectors (verified):**
  - container: `.product-box`
  - title: `.name` → e.g. `"Lenovo Legion Pro 5 83DF002KRM Laptop"`
  - price: `.price` → e.g. `"de la 6 097,49 RON"` (strip "de la"; RO format:
    space-thousands, comma-decimals → `6097.49`)
  - link / stock / merchant: present (`Jump.php` redirect, `.on-stock`,
    `.offer-num`) but **not needed** — we only take the price.
- ~20 product-box per page. Pagination not surfaced in this sample (small result
  set: "2 oferte").

## Altex — SOLVED with curl_cffi

- **Search URL:** `https://altex.ro/cauta/?q={query}`
- Plain `requests`: TLS handshake completes (`TLS_AES_256_GCM_SHA384`) but
  **ALPN negotiates to None** and the server never returns an HTTP response →
  `ReadTimeout` even on HEAD. TLS/HTTP-fingerprint bot block (Akamai-style).
- **Fix: `curl_cffi` with `impersonate="chrome"`** → instant 200, full page
  (~640 KB). No browser binary, ~one pip install. This is the chosen approach.

  ```python
  from curl_cffi import requests as creq
  s = creq.Session(impersonate="chrome")
  r = s.get(url, timeout=30)
  ```

### ★ Altex JSON search API (the winning method)

The `/cauta/` page does not SSR results; it ships an app shell, then the client
calls a backend catalog API. That API is **public and unauthenticated**:

```
GET https://fenrir.altex.ro/v2/catalog/search/{quote(query)}?size=48
    (curl_cffi impersonate="chrome", Accept: application/json, Referer: https://altex.ro/)
```

- Query is a **path segment** (`/search/rtx 4060 laptop`), not `?q=`. `?size=N`
  controls page size; response `meta` has `items`, `page`, `total_pages` for
  pagination. Host `fenrir.altex.ro` (the `-s1` variant returns a thinner body —
  use bare `fenrir`).
- Response JSON keys: `search`, `meta`, **`products`**, `layeredNavigation`,
  `suggestedPages`.
- Per product (verified): `name`, `price` (float, e.g. `6199.9`),
  `regular_price`, `lowest_price`, `sku`, `url_key`, `brand_name`,
  `stock_status` (1=in stock), `pickup_is_in_stock`, `image`, `ean_codes`.
- **Product URL** = `https://altex.ro/{url_key}/cpd/{sku}/`.
- **Availability** = `stock_status == 1 or pickup_is_in_stock`.
- Verified across `rtx 4060 laptop` (21 items), `iphone 15` (17),
  `monitor 4k 27` (30, with correct OOS flags). Clean, fast, no HTML.

This **replaces** the HTML-scraping approach for Altex search — use the API.
Reproduce: `python study/altex_final.py`.

### HTML fallback details (for reference)

- Altex is a **Next.js** app. Two behaviors found:
  - **Product pages: server-rendered price** ✅. Best extractor is the meta
    description: `re.search(r"pretul de ([\d.]+)\s*lei", html)` → clean float
    (e.g. `3499.9`). Fallback: first `[class*="Price"]` element (`"3.499"`,
    needs decimals stripped). Verified on 5 products: 3499.9, 3249.9, 4549.9,
    2699.9, 4699.9 RON. JSON-LD has `availability` but **no price**.
    → **Re-fetching a pinned Altex URL's price works.**
  - **Search results page (`/cauta/?q=`): environment-dependent.**
    - In a **real browser on a RO residential IP**, the results ARE
      server-rendered with these selectors (confirmed by user):
      `div.Product` → card, `span.Product-name` → title, current (red) price in
      `div.leading-none.text-red-brand` with whole part in `span.Price-int` and
      decimals in `sup`.
    - From **this dev environment (datacenter/non-RO IP via curl_cffi)** the same
      URL returns only the **app shell**: identical 638,764-byte response every
      time, with **0** `Product-name` / `Price-int` / `/cpd/` nodes and no result
      array in `__NEXT_DATA__`. Tested cold, warm+referer+cookies, multiple
      Chrome/Edge impersonations, and alt path form — all identical.
    - Conclusion: Altex gates full SSR by client/IP. On the user's machine the
      selector-based parse will work; from a foreign/datacenter host it won't.
      **Implication for deployment:** Altex scouting needs to run from a RO
      residential IP (e.g. the user's own machine / a RO proxy), or via a real
      headless browser. Code the selectors as the user described; just know the
      host running the scraper matters.
    - No public JSON search API found (`/api/search`, autocomplete all 404;
      backend host `fenrir.altex.ro` exists but path unknown / likely signed).
  - **Category pages (e.g. `/laptopuri/cpl/`): server-rendered** ✅ — 48 product
    links with titles, `/cpd/<SKU>/` URLs. Usable for broad scouting, not
    keyword search.

- **Conclusion for Altex:** use `curl_cffi` for both. Pinned-URL price refresh =
  fully supported. Keyword scouting on Altex is limited (search is JS-only); if
  needed, render with a headless browser, or rely on eMAG + Compari for scouting
  and add Altex URLs manually / via category crawl.

## Recommendation for the scraper

1. **eMAG** = primary scout + price source (fix title selector → `a.card-v2-title`).
2. **Compari** = price-signal source only (one request → cheapest market price
   per matched product; take `.price`, ignore link/merchant).
3. **Altex** = use the **JSON API** `fenrir.altex.ro/v2/catalog/search/{q}?size=48`
   via `curl_cffi` for scouting (clean structured data, no IP gating, works
   anywhere). Pinned-URL price refresh via product-page meta-description
   `pretul de X lei` (also `curl_cffi`).
4. Shared: realistic UA, `Accept-Encoding: gzip, deflate` (no br), reuse a
   session, polite delays, tolerate missing fields. Add `curl_cffi` to
   requirements for Altex (and as a fallback for any future TLS-blocked site).

## Reproduce

```
python study/analyze.py        # emag + altex + compari summary -> study/report.txt
python study/compari.py        # compari search dump
python study/compari_card.py   # compari card structure
```
