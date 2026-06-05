"""JSON-backed storage for products and their pinned listings."""
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
        return {"products": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {"products": []}


def _save(data):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def list_products():
    with _lock:
        return _load()["products"]


def get_product(product_id):
    with _lock:
        for p in _load()["products"]:
            if p["id"] == product_id:
                return p
        return None


def add_product(query):
    with _lock:
        data = _load()
        product = {
            "id": uuid.uuid4().hex[:8],
            "query": query,
            "created_at": _now(),
            "listings": [],  # {url, title, price, currency, site, last_checked, available}
        }
        data["products"].append(product)
        _save(data)
        return product


def delete_product(product_id):
    with _lock:
        data = _load()
        before = len(data["products"])
        data["products"] = [p for p in data["products"] if p["id"] != product_id]
        _save(data)
        return len(data["products"]) < before


def add_listing(product_id, listing):
    """Add a pinned listing to a product. Skips duplicate URLs."""
    with _lock:
        data = _load()
        for p in data["products"]:
            if p["id"] == product_id:
                if any(l["url"] == listing["url"] for l in p["listings"]):
                    return None
                p["listings"].append(listing)
                _save(data)
                return listing
        return None


def remove_listing(product_id, url):
    with _lock:
        data = _load()
        for p in data["products"]:
            if p["id"] == product_id:
                before = len(p["listings"])
                p["listings"] = [l for l in p["listings"] if l["url"] != url]
                _save(data)
                return len(p["listings"]) < before
        return False


def update_listing(product_id, url, fields):
    with _lock:
        data = _load()
        for p in data["products"]:
            if p["id"] == product_id:
                for l in p["listings"]:
                    if l["url"] == url:
                        l.update(fields)
                        _save(data)
                        return l
        return None


# --- Pending suggestions from re-scouting (await user confirmation) ---

def list_suggestions(product_id):
    p = get_product(product_id)
    return p.get("suggestions", []) if p else []


def set_suggestions(product_id, suggestions):
    with _lock:
        data = _load()
        for p in data["products"]:
            if p["id"] == product_id:
                existing_urls = {l["url"] for l in p["listings"]}
                p["suggestions"] = [s for s in suggestions if s["url"] not in existing_urls]
                _save(data)
                return p["suggestions"]
        return []


def confirm_suggestion(product_id, url):
    """Move a suggestion into the product's listings."""
    with _lock:
        data = _load()
        for p in data["products"]:
            if p["id"] == product_id:
                sugg = p.get("suggestions", [])
                match = next((s for s in sugg if s["url"] == url), None)
                if not match:
                    return None
                p["suggestions"] = [s for s in sugg if s["url"] != url]
                if not any(l["url"] == url for l in p["listings"]):
                    p["listings"].append(match)
                _save(data)
                return match
        return None


def dismiss_suggestion(product_id, url):
    with _lock:
        data = _load()
        for p in data["products"]:
            if p["id"] == product_id:
                p["suggestions"] = [s for s in p.get("suggestions", []) if s["url"] != url]
                _save(data)
                return True
        return False
