"""Data access layer.

Products/listings are persisted in the database (SQLite via SQLAlchemy).
Wizard drafts (scout results) are ephemeral and kept in memory only.

All functions return plain dicts (not ORM objects), so the rest of the app is
storage-agnostic.
"""
import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, delete

from models import SessionLocal, Product, Listing


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _new_id():
    return uuid.uuid4().hex[:8]


# ============================================================ drafts (memory)
# Drafts hold per-site scout results during a wizard session. They are large,
# short-lived and per-session, so they live in memory, not the DB.

_drafts = {}
_drafts_lock = threading.Lock()


def create_draft(query, results):
    with _drafts_lock:
        draft = {
            "id": _new_id(),
            "query": query,
            "created_at": _now_iso(),
            "results": results,   # {emag:[...], altex:[...], compari:[...]}
        }
        _drafts[draft["id"]] = draft
        return draft


def get_draft(draft_id):
    with _drafts_lock:
        return _drafts.get(draft_id)


def discard_draft(draft_id):
    with _drafts_lock:
        return _drafts.pop(draft_id, None) is not None


# ============================================================ products (DB)

_LISTING_FIELDS = ("url", "title", "price", "currency", "site", "image", "available")


def _listing_from(data):
    """Build a Listing from incoming dict, keeping only known fields."""
    kwargs = {k: data.get(k) for k in _LISTING_FIELDS if data.get(k) is not None}
    kwargs.setdefault("currency", "RON")
    kwargs.setdefault("available", True)
    kwargs["last_checked"] = datetime.now(timezone.utc)
    return Listing(**kwargs)


def create_product(query, listings):
    """Create a product from a query + list of pinned listings (dedup by URL)."""
    with SessionLocal.begin() as s:
        product = Product(id=_new_id(), query=query)
        seen = set()
        for l in listings:
            url = l.get("url")
            if url and url not in seen:
                seen.add(url)
                product.listings.append(_listing_from(l))
        s.add(product)
        s.flush()
        return product.to_dict()


def add_listings(product_id, listings):
    """Append listings to an existing product, dedup by URL."""
    with SessionLocal.begin() as s:
        product = s.get(Product, product_id)
        if not product:
            return None
        existing = {l.url for l in product.listings}
        for l in listings:
            url = l.get("url")
            if url and url not in existing:
                existing.add(url)
                product.listings.append(_listing_from(l))
        s.flush()
        return product.to_dict()


def list_products():
    with SessionLocal() as s:
        rows = s.scalars(select(Product).order_by(Product.created_at.desc())).all()
        return [p.to_dict() for p in rows]


def get_product(product_id):
    with SessionLocal() as s:
        product = s.get(Product, product_id)
        return product.to_dict() if product else None


def delete_product(product_id):
    with SessionLocal.begin() as s:
        product = s.get(Product, product_id)
        if not product:
            return False
        s.delete(product)
        return True


def update_product(product_id, fields):
    """Update editable product fields (title, cover_image)."""
    allowed = {"title", "cover_image"}
    with SessionLocal.begin() as s:
        product = s.get(Product, product_id)
        if not product:
            return None
        for k, v in fields.items():
            if k in allowed:
                setattr(product, k, v)
        s.flush()
        return product.to_dict()


def update_listing(product_id, url, fields):
    """Update fields of one listing (by product + url)."""
    with SessionLocal.begin() as s:
        product = s.get(Product, product_id)
        if not product:
            return None
        for l in product.listings:
            if l.url == url:
                for k, v in fields.items():
                    if hasattr(l, k):
                        if k == "last_checked" and isinstance(v, str):
                            v = datetime.fromisoformat(v)
                        setattr(l, k, v)
                s.flush()
                return l.to_dict()
        return None


def remove_listing(product_id, url):
    """Remove a single link from a product."""
    with SessionLocal.begin() as s:
        product = s.get(Product, product_id)
        if not product:
            return False
        before = len(product.listings)
        for l in list(product.listings):
            if l.url == url:
                product.listings.remove(l)
        s.flush()
        return len(product.listings) < before
