"""Fetch + analyze RO market search pages. Writes a report file (avoids console encoding issues)."""
import os, re, json, time
from urllib.parse import quote_plus, urljoin
import requests
from bs4 import BeautifulSoup

OUT = os.path.dirname(__file__)
QUERY = "rtx 4060 laptop"
REPORT = []

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate",  # no brotli pkg -> no 'br'
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def log(*a):
    REPORT.append(" ".join(str(x) for x in a))


def fetch(url, timeout=30, retries=2):
    s = requests.Session(); s.headers.update(H)
    last = None
    for i in range(retries + 1):
        try:
            return s.get(url, timeout=timeout, allow_redirects=True)
        except Exception as e:
            last = e
            time.sleep(1.5)
    raise last


def analyze_emag(soup):
    cards = soup.select("div.card-item, div.card-v2")
    log(f"  cards (div.card-item,div.card-v2): {len(cards)}")
    out = []
    for c in cards[:5]:
        link = c.select_one("a.card-v2-title, a.js-product-url, h2 a, a[data-zone='title']")
        price = c.select_one("p.product-new-price, .product-new-price")
        out.append({
            "title": (link.get_text(strip=True)[:60] if link else None),
            "href": (link.get("href") if link else None),
            "price_raw": (price.get_text(" ", strip=True) if price else None),
        })
    return out


def analyze_generic(soup, base):
    """Best-effort: JSON-LD ItemList + common product-card heuristics."""
    found = []
    # JSON-LD
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        nodes = data if isinstance(data, list) else [data]
        for n in nodes:
            if isinstance(n, dict) and n.get("@type") in ("ItemList", "Product"):
                found.append(("jsonld", n.get("@type")))
    log(f"  jsonld product/list blocks: {len(found)}")
    # data attributes commonly used
    for attr in ["data-product-id", "data-sku", "data-testid"]:
        els = soup.select(f"[{attr}]")
        if els:
            log(f"  [{attr}]: {len(els)} (sample testid/values: "
                f"{[e.get(attr) for e in els[:3]]})")
    # price-looking text
    prices = re.findall(r"\d[\d.\s]*,\d{2}\s*(?:lei|ron|Lei)", soup.get_text(" "), re.I)
    log(f"  price-pattern matches in text: {len(prices)} sample={prices[:3]}")
    return found


SITES = [
    ("emag",    "https://www.emag.ro/search/{q}"),
    ("altex",   "https://altex.ro/cauta/?q={q}"),
    ("compari", "https://www.compari.ro/cgi-bin/g.cgi?st={q}"),
]


def run():
    for name, tpl in SITES:
        url = tpl.format(q=quote_plus(QUERY))
        log(f"\n===== {name} =====")
        log(f"url: {url}")
        try:
            r = fetch(url)
        except Exception as e:
            log(f"  FETCH FAILED: {type(e).__name__}: {str(e)[:140]}")
            continue
        log(f"  status={r.status_code} bytes={len(r.text)} final={r.url[:100]}")
        log(f"  server={r.headers.get('server','?')} ct={r.headers.get('content-type','?')[:40]}")
        low = r.text.lower()
        for sig in ["captcha", "datadome", "perimeterx", "are you a robot",
                    "challenge-platform", "cf-chl", "incapsula", "px-captcha"]:
            if sig in low:
                log(f"  GUARD: '{sig}'")
        for sig in ["__next_data__", "__nuxt__", "ng-version", "application/ld+json"]:
            if sig in low:
                log(f"  framework: '{sig}'")
        with open(os.path.join(OUT, f"{name}.html"), "w", encoding="utf-8") as f:
            f.write(r.text)
        soup = BeautifulSoup(r.text, "html.parser")
        log(f"  title: {(soup.title.get_text(strip=True)[:70] if soup.title else None)!r}")
        if name == "emag":
            sample = analyze_emag(soup)
            log("  SAMPLE PRODUCTS:")
            for s in sample:
                log(f"    - {s}")
        else:
            analyze_generic(soup, r.url)
        time.sleep(2)

    with open(os.path.join(OUT, "report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(REPORT))


if __name__ == "__main__":
    run()
    print("done -> study/report.txt")
