"""Web scraping for Romanian retail sites.

Two responsibilities:
  - search(query): scout listings for a query term (used on add + re-scout).
  - fetch_price(url): re-fetch the current price/availability of a pinned URL.

Primary source is eMAG.ro (dominant RO retailer). A generic JSON-LD / meta-tag
price extractor handles arbitrary pinned URLs from other sites.
"""
import re
import json
from urllib.parse import quote_plus, urlparse

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
TIMEOUT = 15


def _site_of(url):
    return urlparse(url).netloc.replace("www.", "")


def _parse_ron(text):
    """Extract a RON price from messy text like '4.299,99 Lei' -> 4299.99."""
    if not text:
        return None
    text = text.replace("\xa0", " ")
    m = re.search(r"(\d[\d.\s]*,?\d*)", text)
    if not m:
        return None
    raw = m.group(1).strip().replace(" ", "")
    # Romanian format: '.' thousands, ',' decimals
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(".", "") if raw.count(".") > 1 else raw
    try:
        return round(float(raw), 2)
    except ValueError:
        return None


def _get(url):
    return requests.get(url, headers=HEADERS, timeout=TIMEOUT)


# --------------------------------------------------------------------------
# eMAG search (scouting)
# --------------------------------------------------------------------------

def search_emag(query, limit=12):
    """Scrape eMAG search results for a query. Returns list of listing dicts."""
    url = f"https://www.emag.ro/search/{quote_plus(query)}"
    results = []
    try:
        resp = _get(url)
        resp.raise_for_status()
    except requests.RequestException:
        return results

    soup = BeautifulSoup(resp.text, "html.parser")
    cards = soup.select("div.card-item, div.card-v2")
    for card in cards:
        link = card.select_one("a.card-v2-title, a.js-product-url, h2 a, a[data-zone='title']")
        if not link or not link.get("href"):
            continue
        href = link["href"]
        if href.startswith("/"):
            href = "https://www.emag.ro" + href
        title = link.get_text(strip=True) or card.get("data-name", "")

        price_el = card.select_one("p.product-new-price, span.product-new-price, .product-new-price")
        price = _parse_ron(price_el.get_text(" ", strip=True)) if price_el else None
        if not title or price is None:
            continue

        results.append({
            "url": href.split("?")[0],
            "title": title,
            "price": price,
            "currency": "RON",
            "site": "emag.ro",
            "available": True,
        })
        if len(results) >= limit:
            break
    return results


def search(query, limit=12):
    """Aggregate search across supported sites."""
    return search_emag(query, limit=limit)


# --------------------------------------------------------------------------
# Generic price fetch for a pinned URL
# --------------------------------------------------------------------------

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


def fetch_price(url):
    """Fetch current price + availability for a pinned URL.

    Returns {price, currency, available, title?} or {error:...}.
    """
    try:
        resp = _get(url)
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"error": str(e), "available": False}

    soup = BeautifulSoup(resp.text, "html.parser")
    site = _site_of(url)
    title = None
    if soup.title:
        title = soup.title.get_text(strip=True)

    # eMAG product page has a stable price element.
    if "emag.ro" in site:
        el = soup.select_one("p.product-new-price")
        price = _parse_ron(el.get_text(" ", strip=True)) if el else None
        out_of_stock = bool(soup.select_one(".label-out_of_stock, .product-out-of-stock"))
        if price is not None:
            return {"price": price, "currency": "RON",
                    "available": not out_of_stock, "title": title}

    # Generic structured-data path.
    price, avail = _from_jsonld(soup)
    if price is None:
        price = _from_meta(soup)
        avail = price is not None
    if price is not None:
        return {"price": round(price, 2), "currency": "RON",
                "available": bool(avail), "title": title}

    return {"error": "price not found", "available": False, "title": title}
