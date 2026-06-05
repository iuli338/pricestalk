"""JSON-backed storage: wizard drafts + finalized product entities.

Drafts hold scout results only; pinning is client-side. The client sends the
final listing list on create/add-links.

Schema (data.json):
{
  "drafts":   [ {id, query, created_at, results:{emag,altex,compari}} ],
  "products": [ {id, query, created_at, listings:[listing...], title?, cover_image?} ]
}
A listing: {url, title, price, currency, site, image, available, last_checked}
"""
import json
import os
import threading
import uuid
from datetime import datetime, timezone

DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")
_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _load():
    if not os.path.exists(DATA_FILE):
        return {"drafts": [], "products": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            return {"drafts": [], "products": []}
    data.setdefault("drafts", [])
    data.setdefault("products", [])
    return data


def _save(data):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def _find(items, item_id):
    return next((x for x in items if x["id"] == item_id), None)


# ------------------------------------------------------------------ drafts

def create_draft(query, results):
    """Create a wizard draft holding per-site scout results."""
    with _lock:
        data = _load()
        draft = {
            "id": uuid.uuid4().hex[:8],
            "query": query,
            "created_at": _now(),
            "results": results,   # {emag:[...], altex:[...], compari:[...]}
        }
        data["drafts"].append(draft)
        _save(data)
        return draft


def get_draft(draft_id):
    with _lock:
        return _find(_load()["drafts"], draft_id)


def discard_draft(draft_id):
    with _lock:
        data = _load()
        before = len(data["drafts"])
        data["drafts"] = [d for d in data["drafts"] if d["id"] != draft_id]
        _save(data)
        return len(data["drafts"]) < before


# ---------------------------------------------------------------- products

def _clean_listing(l):
    """Keep only the listing fields we persist; stamp last_checked."""
    out = {k: l.get(k) for k in
           ("url", "title", "price", "currency", "site", "image", "available")}
    out["last_checked"] = _now()
    return out


def create_product(query, listings):
    """Create a product entity from a query + list of pinned listings."""
    with _lock:
        data = _load()
        seen, clean = set(), []
        for l in listings:
            if l.get("url") and l["url"] not in seen:
                seen.add(l["url"])
                clean.append(_clean_listing(l))
        product = {
            "id": uuid.uuid4().hex[:8],
            "query": query,
            "created_at": _now(),
            "listings": clean,
        }
        data["products"].append(product)
        _save(data)
        return product


def add_listings(product_id, listings):
    """Append listings to an existing product, dedup by URL."""
    with _lock:
        data = _load()
        product = _find(data["products"], product_id)
        if not product:
            return None
        existing = {l.get("url") for l in product["listings"]}
        for l in listings:
            if l.get("url") and l["url"] not in existing:
                existing.add(l["url"])
                product["listings"].append(_clean_listing(l))
        _save(data)
        return product


def list_products():
    with _lock:
        return _load()["products"]


def get_product(product_id):
    with _lock:
        return _find(_load()["products"], product_id)


def delete_product(product_id):
    with _lock:
        data = _load()
        before = len(data["products"])
        data["products"] = [p for p in data["products"] if p["id"] != product_id]
        _save(data)
        return len(data["products"]) < before


def update_product(product_id, fields):
    """Update editable product fields (title, cover_image)."""
    allowed = {"title", "cover_image"}
    with _lock:
        data = _load()
        product = _find(data["products"], product_id)
        if not product:
            return None
        for k, v in fields.items():
            if k in allowed:
                product[k] = v
        _save(data)
        return product


def update_listing(product_id, url, fields):
    with _lock:
        data = _load()
        product = _find(data["products"], product_id)
        if not product:
            return None
        for l in product["listings"]:
            if l.get("url") == url:
                l.update(fields)
                _save(data)
                return l
        return None


def remove_listing(product_id, url):
    """Remove a single link from a saved product."""
    with _lock:
        data = _load()
        product = _find(data["products"], product_id)
        if not product:
            return False
        before = len(product["listings"])
        product["listings"] = [l for l in product["listings"] if l.get("url") != url]
        _save(data)
        return len(product["listings"]) < before
