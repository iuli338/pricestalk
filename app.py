"""PriceStalk - Flask backend."""
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request

import storage
import scraper
import scheduler

app = Flask(__name__)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _min_price(product):
    prices = [l["price"] for l in product["listings"]
              if l.get("price") is not None and l.get("available", True)]
    return min(prices) if prices else None


def _decorate(product):
    """Attach computed fields for the UI."""
    p = dict(product)
    p["min_price"] = _min_price(product)
    p["listing_count"] = len(product["listings"])
    p["suggestion_count"] = len(product.get("suggestions", []))
    return p


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/products")
def api_products():
    return jsonify([_decorate(p) for p in storage.list_products()])


@app.route("/api/products/<pid>")
def api_product(pid):
    p = storage.get_product(pid)
    if not p:
        return jsonify({"error": "not found"}), 404
    return jsonify(_decorate(p))


@app.route("/api/products", methods=["POST"])
def api_add_product():
    query = (request.json or {}).get("query", "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    product = storage.add_product(query)
    return jsonify(_decorate(product)), 201


@app.route("/api/products/<pid>", methods=["DELETE"])
def api_delete_product(pid):
    return jsonify({"deleted": storage.delete_product(pid)})


@app.route("/api/products/<pid>/search")
def api_search(pid):
    """Run initial scout for a product; return found listings to pin."""
    p = storage.get_product(pid)
    if not p:
        return jsonify({"error": "not found"}), 404
    found = scraper.search(p["query"])
    pinned = {l["url"] for l in p["listings"]}
    for f in found:
        f["pinned"] = f["url"] in pinned
    return jsonify(found)


@app.route("/api/products/<pid>/listings", methods=["POST"])
def api_pin(pid):
    listing = request.json or {}
    listing.setdefault("currency", "RON")
    listing.setdefault("available", True)
    listing["last_checked"] = _now()
    if not listing.get("url"):
        return jsonify({"error": "url required"}), 400
    # If pinning a bare URL, fetch its price now.
    if listing.get("price") is None:
        res = scraper.fetch_price(listing["url"])
        listing["price"] = res.get("price")
        listing["available"] = res.get("available", True)
        listing["site"] = listing.get("site") or _site(listing["url"])
        if not listing.get("title"):
            listing["title"] = res.get("title") or listing["url"]
    added = storage.add_listing(pid, listing)
    if added is None:
        return jsonify({"error": "duplicate or product not found"}), 409
    return jsonify(added), 201


@app.route("/api/products/<pid>/listings", methods=["DELETE"])
def api_unpin(pid):
    url = (request.json or {}).get("url", "")
    return jsonify({"removed": storage.remove_listing(pid, url)})


@app.route("/api/products/<pid>/refresh", methods=["POST"])
def api_refresh(pid):
    p = storage.get_product(pid)
    if not p:
        return jsonify({"error": "not found"}), 404
    scheduler.refresh_product(p)
    return jsonify(_decorate(storage.get_product(pid)))


@app.route("/api/products/<pid>/suggestions/confirm", methods=["POST"])
def api_confirm(pid):
    url = (request.json or {}).get("url", "")
    res = storage.confirm_suggestion(pid, url)
    return jsonify({"confirmed": res is not None, "listing": res})


@app.route("/api/products/<pid>/suggestions/dismiss", methods=["POST"])
def api_dismiss(pid):
    url = (request.json or {}).get("url", "")
    return jsonify({"dismissed": storage.dismiss_suggestion(pid, url)})


@app.route("/api/notifications")
def api_notifications():
    return jsonify(scheduler.get_notifications(clear=request.args.get("clear") == "1"))


def _site(url):
    from urllib.parse import urlparse
    return urlparse(url).netloc.replace("www.", "")


if __name__ == "__main__":
    scheduler.start()
    app.run(debug=True, port=5000)
