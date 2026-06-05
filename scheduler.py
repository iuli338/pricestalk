"""24h re-scout: refresh pinned prices and surface new listings as suggestions."""
import threading

from apscheduler.schedulers.background import BackgroundScheduler

import storage
import scraper

_notifications = []  # in-memory feed of new suggestions
_notif_lock = threading.Lock()


def _notify(product, new_items):
    with _notif_lock:
        _notifications.append({
            "product_id": product["id"],
            "query": product["query"],
            "count": len(new_items),
        })


def get_notifications(clear=False):
    with _notif_lock:
        items = list(_notifications)
        if clear:
            _notifications.clear()
        return items


def refresh_product(product):
    """Re-fetch pinned prices and scout for new listings."""
    # Update existing pinned listings.
    for l in product["listings"]:
        res = scraper.fetch_price(l["url"])
        fields = {"last_checked": _iso_now()}
        if "price" in res:
            fields["price"] = res["price"]
        fields["available"] = res.get("available", l.get("available", True))
        storage.update_listing(product["id"], l["url"], fields)

    # Scout for new listings of the same query.
    found = scraper.search(product["query"])
    suggestions = storage.set_suggestions(product["id"], found)
    if suggestions:
        _notify(product, suggestions)


def refresh_all():
    for product in storage.list_products():
        refresh_product(product)


def _iso_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def start():
    sched = BackgroundScheduler(daemon=True)
    sched.add_job(refresh_all, "interval", hours=24, id="rescout")
    sched.start()
    return sched
