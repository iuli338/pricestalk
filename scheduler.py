"""Price re-fetch: 24h background job + on-demand per-product refresh.

A per-product `refreshing` flag (in memory) guards against concurrent refreshes
and lets the UI show a loading state that survives modal/page reopens.
"""
import threading
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

import storage
import scraper

_notifications = []          # price-drop feed
_refreshing = set()          # product ids currently being refreshed
_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def get_notifications(clear=False):
    with _lock:
        items = list(_notifications)
        if clear:
            _notifications.clear()
        return items


def is_refreshing(product_id):
    with _lock:
        return product_id in _refreshing


def refreshing_ids():
    with _lock:
        return set(_refreshing)


def _refetch_listing(product, l):
    """Re-fetch one listing's price; record a drop notification."""
    old = l.get("price")
    res = scraper.fetch_price(l["url"])
    fields = {"last_checked": _now()}
    if res.get("price") is not None:
        fields["price"] = res["price"]
        if old and res["price"] < old:
            with _lock:
                _notifications.append({
                    "product_id": product["id"], "query": product["query"],
                    "site": l.get("site"), "old": old, "new": res["price"],
                })
    fields["available"] = res.get("available", l.get("available", True))
    storage.update_listing(product["id"], l["url"], fields)


def refresh_product(product):
    """Re-fetch all of a product's listings. No guard (used by the 24h job)."""
    for l in product["listings"]:
        if l.get("url"):
            _refetch_listing(product, l)


def refresh_product_guarded(product_id):
    """On-demand refresh with a busy guard.

    Returns the updated product dict, or None if it is already refreshing
    or does not exist.
    """
    with _lock:
        if product_id in _refreshing:
            return None
        _refreshing.add(product_id)
    try:
        product = storage.get_product(product_id)
        if not product:
            return None
        for l in product["listings"]:
            if l.get("url"):
                _refetch_listing(product, l)
        return storage.get_product(product_id)
    finally:
        with _lock:
            _refreshing.discard(product_id)


def refresh_all():
    for product in storage.list_products():
        refresh_product(product)


def start(hours=24):
    """Start the periodic price re-fetch. hours<=0 disables it."""
    if hours <= 0:
        return None
    sched = BackgroundScheduler(daemon=True)
    sched.add_job(refresh_all, "interval", hours=hours, id="refetch")
    sched.start()
    return sched
