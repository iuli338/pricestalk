"""Web scraping for Romanian retail sites (eMAG, Altex, Compari).

Responsibilities:
  - scout_all(query): search all sites, grouped per site (used by the wizard).
  - search_emag / search_altex / search_compari: per-site scouting.
  - fetch_price(url): re-fetch current price/availability of a pinned URL.

Methods (see study/FINDINGS.md):
  - eMAG: server-rendered HTML via curl_cffi (browser impersonation).
  - Altex: JSON API fenrir.altex.ro/v2/catalog/search via curl_cffi (TLS block).
  - Compari: HTML via curl_cffi. Price-signal only (no real pinnable link).
"""
import re
import json
from urllib.parse import quote_plus, quote, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests as creq

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate",  # no 'br' (brotli not guaranteed)
}
TIMEOUT = 20

# A specific Chrome version impersonation passes Cloudflare (compari) where the
# generic "chrome" alias is blocked; plain requests is blocked on datacenter IPs.
IMPERSONATE = "chrome124"


def _cffi_session():
    """curl_cffi session impersonating a real browser (TLS + HTTP fingerprint)."""
    s = creq.Session(impersonate=IMPERSONATE)
    s.headers.update({
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
    })
    return s


def _site_of(url):
    return urlparse(url).netloc.replace("www.", "")


def _parse_ron(text):
    """Parse a RON price from messy text like '4.299,99 Lei' or '6 097,49 RON'."""
    if not text:
        return None
    text = text.replace("\xa0", " ")
    m = re.search(r"(\d[\d.\s]*,?\d*)", text)
    if not m:
        return None
    raw = m.group(1).strip().replace(" ", "")
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif raw.count(".") > 1:
        raw = raw.replace(".", "")
    try:
        return round(float(raw), 2)
    except ValueError:
        return None


# --------------------------------------------------------------------------
# eMAG (HTML via curl_cffi)
# --------------------------------------------------------------------------

def search_emag(query, limit=24):
    url = f"https://www.emag.ro/search/{quote_plus(query)}"
    out = []
    try:
        r = _cffi_session().get(url, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception:
        return out

    soup = BeautifulSoup(r.text, "html.parser")
    seen = set()
    for card in soup.select("div.card-item, div.card-v2"):
        link = card.select_one("a.card-v2-title")  # product-name anchor (not the badge)
        if not link or not link.get("href"):
            continue
        href = link["href"].split("?")[0]
        if href.startswith("/"):
            href = "https://www.emag.ro" + href
        if href in seen:
            continue
        title = link.get_text(strip=True)
        price_el = card.select_one("p.product-new-price")
        price = _parse_ron(price_el.get_text(" ", strip=True)) if price_el else None
        if not title or price is None:
            continue
        img_el = card.select_one("img")
        image = img_el.get("src") or img_el.get("data-src") if img_el else None
        seen.add(href)
        out.append({
            "url": href, "title": title, "price": price,
            "currency": "RON", "site": "emag.ro", "image": image,
            "available": True, "pinnable": True,
        })
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------
# Altex (JSON API, curl_cffi)
# --------------------------------------------------------------------------

def search_altex(query, limit=24):
    out = []
    try:
        s = creq.Session(impersonate="chrome")
        s.headers.update({
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ro-RO,ro;q=0.9",
            "Referer": "https://altex.ro/",
        })
        url = f"https://fenrir.altex.ro/v2/catalog/search/{quote(query)}?size={limit}"
        r = s.get(url, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception:
        return out

    for p in data.get("products", []):
        if not p.get("url_key") or not p.get("sku"):
            continue
        # image is like '/media/catalog/product/...'; prefix the CDN host directly.
        # Do NOT add '/resize' -- that path without a resize-hash returns a placeholder.
        img = p.get("image")
        if img and img.startswith("/"):
            img = "https://lcdn.altex.ro" + img
        out.append({
            "url": f"https://altex.ro/{p['url_key']}/cpd/{p['sku']}/",
            "title": p.get("name"),
            "price": p.get("price"),
            "currency": "RON",
            "site": "altex.ro",
            "image": img,
            "available": bool(p.get("stock_status") == 1 or p.get("pickup_is_in_stock")),
            "pinnable": True,
        })
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------
# Compari (HTML, price-signal only — not pinnable)
# --------------------------------------------------------------------------

def search_compari(query, limit=24):
    out = []
    try:
        s = _cffi_session()
        s.get("https://www.compari.ro/", timeout=TIMEOUT)  # warm Cloudflare cookies
        url = "https://www.compari.ro/CategorySearch.php?st=" + quote_plus(query)
        r = s.get(url, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception:
        return out

    soup = BeautifulSoup(r.text, "html.parser")
    for box in soup.select(".product-box"):
        name = box.select_one(".name")
        price_el = box.select_one(".price")
        if not name or not price_el:
            continue
        price = _parse_ron(price_el.get_text(" ", strip=True))
        if price is None:
            continue
        img_el = box.select_one("img")
        image = (img_el.get("src") or img_el.get("data-src")) if img_el else None
        out.append({
            "url": None,  # Compari is a redirect aggregator; no stable pinnable link
            "title": name.get_text(" ", strip=True),
            "price": price,
            "currency": "RON",
            "site": "compari.ro",
            "image": image,
            "available": True,
            "pinnable": False,
        })
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------
# Aggregate (wizard) + single-URL price refetch
# --------------------------------------------------------------------------

SITES = ["emag", "altex", "compari"]
_SEARCHERS = {"emag": search_emag, "altex": search_altex, "compari": search_compari}


def scout_all(query, limit=24):
    """Search all sites. Returns {site: [listings...]} in wizard order."""
    return {site: _SEARCHERS[site](query, limit=limit) for site in SITES}


def fetch_price(url):
    """Re-fetch price + availability for a pinned URL (eMAG or Altex)."""
    site = _site_of(url)

    if "altex.ro" in site:
        return _fetch_altex_price(url)

    # eMAG / generic HTML (browser impersonation to pass bot guards).
    try:
        r = _cffi_session().get(url, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as e:
        return {"error": str(e), "available": False}
    soup = BeautifulSoup(r.text, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None

    if "emag.ro" in site:
        el = soup.select_one("p.product-new-price")
        price = _parse_ron(el.get_text(" ", strip=True)) if el else None
        oos = bool(soup.select_one(".label-out_of_stock, .product-out-of-stock"))
        if price is not None:
            return {"price": price, "currency": "RON", "available": not oos, "title": title}

    price, avail = _from_jsonld(soup)
    if price is None:
        price = _from_meta(soup)
        avail = price is not None
    if price is not None:
        return {"price": round(price, 2), "currency": "RON", "available": bool(avail), "title": title}
    return {"error": "price not found", "available": False, "title": title}


def _fetch_altex_price(url):
    """Altex product page: price from meta-description 'pretul de X lei' via curl_cffi."""
    try:
        s = creq.Session(impersonate="chrome")
        s.headers.update({"User-Agent": UA, "Accept-Language": "ro-RO,ro;q=0.9"})
        r = s.get(url, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as e:
        return {"error": str(e), "available": False}
    html = r.text
    m = re.search(r"pretul de ([\d.]+)\s*lei", html, re.I)
    price = float(m.group(1)) if m else None
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else None
    if price is None:
        el = soup.select_one('[class*="Price"]')
        if el:
            price = _parse_ron(el.get_text(strip=True))
    avail = "InStock" in html or "in stoc" in html.lower()
    if price is not None:
        return {"price": round(price, 2), "currency": "RON", "available": avail, "title": title}
    return {"error": "price not found", "available": False, "title": title}


def _from_jsonld(soup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        for node in data if isinstance(data, list) else [data]:
            if not isinstance(node, dict):
                continue
            offers = node.get("offers")
            if isinstance(offers, list):
                offers = offers[0] if offers else None
            if isinstance(offers, dict):
                price = offers.get("price") or offers.get("lowPrice")
                avail = (offers.get("availability") or "").lower()
                if price is not None:
                    try:
                        return float(price), "instock" in avail or avail == ""
                    except (ValueError, TypeError):
                        pass
    return None, None


def _from_meta(soup):
    for sel in ['meta[property="product:price:amount"]', 'meta[itemprop="price"]']:
        el = soup.select_one(sel)
        if el and el.get("content"):
            p = _parse_ron(el["content"])
            if p is not None:
                return p
    return None
