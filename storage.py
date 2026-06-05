"""JSON-backed storage: wizard drafts + finalized product entities.

Schema (data.json):
{
  "drafts":   [ {id, query, created_at, results:{emag,altex,compari}, pinned:[listing...]} ],
  "products": [ {id, query, created_at, listings:[listing...]} ]
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
            "pinned": [],
        }
        data["drafts"].append(draft)
        _save(data)
        return draft


def get_draft(draft_id):
    with _lock:
        return _find(_load()["drafts"], draft_id)


def pin_to_draft(draft_id, listing):
    """Pin a listing into a draft (skips duplicate URLs)."""
    with _lock:
        data = _load()
        draft = _find(data["drafts"], draft_id)
        if not draft:
            return None
        if listing.get("url") and any(l.get("url") == listing["url"] for l in draft["pinned"]):
            return None
        listing = dict(listing)
        listing["last_checked"] = _now()
        draft["pinned"].append(listing)
        _save(data)
        return listing


def unpin_from_draft(draft_id, url):
    with _lock:
        data = _load()
        draft = _find(data["drafts"], draft_id)
        if not draft:
            return False
        before = len(draft["pinned"])
        draft["pinned"] = [l for l in draft["pinned"] if l.get("url") != url]
        _save(data)
        return len(draft["pinned"]) < before


def discard_draft(draft_id):
    with _lock:
        data = _load()
        before = len(data["drafts"])
        data["drafts"] = [d for d in data["drafts"] if d["id"] != draft_id]
        _save(data)
        return len(data["drafts"]) < before


def finalize_draft(draft_id):
    """Turn a draft's pinned listings into a saved product entity."""
    with _lock:
        data = _load()
        draft = _find(data["drafts"], draft_id)
        if not draft:
            return None
        product = {
            "id": uuid.uuid4().hex[:8],
            "query": draft["query"],
            "created_at": _now(),
            "listings": draft["pinned"],
        }
        data["products"].append(product)
        data["drafts"] = [d for d in data["drafts"] if d["id"] != draft_id]
        _save(data)
        return product


def append_draft_to_product(product_id, draft_id):
    """Append a draft's pinned listings to an existing product, then drop the draft."""
    with _lock:
        data = _load()
        product = _find(data["products"], product_id)
        draft = _find(data["drafts"], draft_id)
        if not product or not draft:
            return None
        existing = {l.get("url") for l in product["listings"]}
        for l in draft["pinned"]:
            if l.get("url") not in existing:
                product["listings"].append(l)
                existing.add(l.get("url"))
        data["drafts"] = [d for d in data["drafts"] if d["id"] != draft_id]
        _save(data)
        return product


# ---------------------------------------------------------------- products

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
