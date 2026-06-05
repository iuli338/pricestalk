"""24h re-fetch of pinned listing prices (detect price drops)."""
import threading
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

import storage
import scraper

_notifications = []  # price-drop feed
_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def get_notifications(clear=False):
    with _lock:
        items = list(_notifications)
        if clear:
            _notifications.clear()
        return items


def refresh_product(product):
    """Re-fetch each pinned listing's price; record drops."""
    for l in product["listings"]:
        if not l.get("url"):
            continue
        old = l.get("price")
        res = scraper.fetch_price(l["url"])
        fields = {"last_checked": _now()}
        if "price" in res and res["price"] is not None:
            fields["price"] = res["price"]
            if old and res["price"] < old:
                with _lock:
                    _notifications.append({
                        "product_id": product["id"], "query": product["query"],
                        "site": l.get("site"), "old": old, "new": res["price"],
                    })
        fields["available"] = res.get("available", l.get("available", True))
        storage.update_listing(product["id"], l["url"], fields)


def refresh_all():
    for product in storage.list_products():
        refresh_product(product)


def start():
    sched = BackgroundScheduler(daemon=True)
    sched.add_job(refresh_all, "interval", hours=24, id="refetch")
    sched.start()
    return sched
