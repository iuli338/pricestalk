"""Data access layer.

Products/listings are persisted in the database (SQLite via SQLAlchemy).
Wizard drafts (scout results) are ephemeral and kept in memory only.

All functions return plain dicts (not ORM objects), so the rest of the app is
storage-agnostic.
"""
import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, delete, func, case

from models import SessionLocal, Product, Listing, User


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


def _owned(s, product_id, user_id):
    """Fetch a product only if it belongs to user_id (else None)."""
    product = s.get(Product, product_id)
    if product and product.user_id == user_id:
        return product
    return None


def create_product(user_id, query, listings):
    """Create a product owned by user_id (dedup listings by URL)."""
    with SessionLocal.begin() as s:
        product = Product(id=_new_id(), user_id=user_id, query=query)
        seen = set()
        for l in listings:
            url = l.get("url")
            if url and url not in seen:
                seen.add(url)
                product.listings.append(_listing_from(l))
        s.add(product)
        s.flush()
        return product.to_dict()


def add_listings(user_id, product_id, listings):
    """Append listings to a user's product, dedup by URL."""
    with SessionLocal.begin() as s:
        product = _owned(s, product_id, user_id)
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


def list_products(user_id):
    with SessionLocal() as s:
        rows = s.scalars(
            select(Product).where(Product.user_id == user_id)
            .order_by(Product.created_at.desc())
        ).all()
        return [p.to_dict() for p in rows]


def list_product_summaries(user_id):
    """Lightweight card data per product, aggregated in SQL (no full listings).

    Returns dicts with: id, title, query, cover_image, min_price, listing_count.
    min_price = cheapest in-stock priced listing; cover = product cover or any image.
    """
    # price only counts when available and > 0
    eff_price = case((((Listing.available == True) & (Listing.price > 0)), Listing.price))
    q = (
        select(
            Product.id, Product.query, Product.title, Product.cover_image,
            func.count(Listing.id).label("listing_count"),
            func.min(eff_price).label("min_price"),
            func.max(Listing.image).label("any_image"),
        )
        .outerjoin(Listing, Listing.product_id == Product.id)
        .where(Product.user_id == user_id)
        .group_by(Product.id)
        .order_by(Product.created_at.desc())
    )
    with SessionLocal() as s:
        out = []
        for r in s.execute(q):
            out.append({
                "id": r.id,
                "query": r.query,
                "title": r.title or r.query,
                "cover_image": r.cover_image or r.any_image,
                "min_price": r.min_price,
                "listing_count": r.listing_count,
            })
        return out


def get_product(user_id, product_id):
    with SessionLocal() as s:
        product = _owned(s, product_id, user_id)
        return product.to_dict() if product else None


def delete_product(user_id, product_id):
    with SessionLocal.begin() as s:
        product = _owned(s, product_id, user_id)
        if not product:
            return False
        s.delete(product)
        return True


def update_product(user_id, product_id, fields):
    """Update editable fields (title, cover_image) of a user's product."""
    allowed = {"title", "cover_image"}
    with SessionLocal.begin() as s:
        product = _owned(s, product_id, user_id)
        if not product:
            return None
        for k, v in fields.items():
            if k in allowed:
                setattr(product, k, v)
        s.flush()
        return product.to_dict()


def remove_listing(user_id, product_id, url):
    """Remove a single link from a user's product."""
    with SessionLocal.begin() as s:
        product = _owned(s, product_id, user_id)
        if not product:
            return False
        before = len(product.listings)
        for l in list(product.listings):
            if l.url == url:
                product.listings.remove(l)
        s.flush()
        return len(product.listings) < before


def update_listing(product_id, url, fields):
    """Update one listing (by product + url). Internal — used by the scheduler;
    not user-scoped because it operates on products already fetched server-side."""
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


def all_products():
    """Every product across users (for the 24h scheduler job)."""
    with SessionLocal() as s:
        return [p.to_dict() for p in s.scalars(select(Product)).all()]


# =============================================================== users (DB)
# User functions return the ORM object (Flask-Login needs it), detached so it
# stays usable after the session closes.

def _detach(s, user):
    if user:
        s.expunge(user)
    return user


def create_user(email, nickname, password_hash):
    with SessionLocal() as s:
        user = User(email=email, nickname=nickname, password_hash=password_hash)
        s.add(user)
        s.commit()
        s.refresh(user)
        return _detach(s, user)


def get_user(user_id):
    with SessionLocal() as s:
        return _detach(s, s.get(User, user_id))


def get_user_by_email(email):
    with SessionLocal() as s:
        user = s.scalars(select(User).where(User.email == email)).first()
        return _detach(s, user)
