"""PriceStalk - Flask backend.

Wizard flow:
  POST /api/scout            -> scrape all sites, create a draft, return it
  GET  /api/drafts/<id>      -> draft with results + pinned
  POST /api/drafts/<id>/pin  -> pin a listing
  POST /api/drafts/<id>/unpin
  POST /api/drafts/<id>/finalize -> save as product entity
  DELETE /api/drafts/<id>    -> discard

Entities:
  GET  /api/products
  GET  /api/products/<id>
  POST /api/products/<id>/refresh
  DELETE /api/products/<id>
"""
from flask import Flask, jsonify, render_template, request

import storage
import scraper
import scheduler

app = Flask(__name__)


def _min_price(product):
    prices = [l["price"] for l in product["listings"]
              if l.get("price") and l["price"] > 0 and l.get("available", True)]
    return min(prices) if prices else None


def _decorate(product):
    p = dict(product)
    p["min_price"] = _min_price(product)
    p["listing_count"] = len(product["listings"])
    # title defaults to the initial search query; cover defaults to first image
    p["title"] = product.get("title") or product.get("query")
    p["cover_image"] = product.get("cover_image") or next(
        (l["image"] for l in product["listings"] if l.get("image")), None)
    return p


@app.route("/")
def index():
    return render_template("index.html")


# -------------------------------------------------------------- wizard

@app.route("/api/scout", methods=["POST"])
def api_scout():
    query = (request.json or {}).get("query", "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    results = scraper.scout_all(query)
    draft = storage.create_draft(query, results)
    return jsonify(draft), 201


@app.route("/api/drafts/<did>")
def api_draft(did):
    draft = storage.get_draft(did)
    if not draft:
        return jsonify({"error": "not found"}), 404
    return jsonify(draft)


@app.route("/api/drafts/<did>/pin", methods=["POST"])
def api_pin(did):
    listing = request.json or {}
    if not listing.get("url"):
        return jsonify({"error": "url required"}), 400
    res = storage.pin_to_draft(did, listing)
    if res is None:
        return jsonify({"error": "duplicate or draft not found"}), 409
    return jsonify(res), 201


@app.route("/api/drafts/<did>/unpin", methods=["POST"])
def api_unpin(did):
    url = (request.json or {}).get("url", "")
    return jsonify({"removed": storage.unpin_from_draft(did, url)})


@app.route("/api/drafts/<did>/finalize", methods=["POST"])
def api_finalize(did):
    product = storage.finalize_draft(did)
    if not product:
        return jsonify({"error": "not found"}), 404
    return jsonify(_decorate(product)), 201


@app.route("/api/drafts/<did>", methods=["DELETE"])
def api_discard(did):
    return jsonify({"discarded": storage.discard_draft(did)})


# ------------------------------------------------------------ entities

@app.route("/api/products")
def api_products():
    return jsonify([_decorate(p) for p in storage.list_products()])


@app.route("/api/products/<pid>")
def api_product(pid):
    p = storage.get_product(pid)
    if not p:
        return jsonify({"error": "not found"}), 404
    return jsonify(_decorate(p))


@app.route("/api/products/<pid>", methods=["DELETE"])
def api_delete(pid):
    return jsonify({"deleted": storage.delete_product(pid)})


@app.route("/api/products/<pid>", methods=["PATCH"])
def api_update(pid):
    body = request.json or {}
    fields = {}
    if "title" in body:
        fields["title"] = (body["title"] or "").strip() or storage.get_product(pid)["query"]
    if "cover_image" in body:
        fields["cover_image"] = body["cover_image"]
    p = storage.update_product(pid, fields)
    if not p:
        return jsonify({"error": "not found"}), 404
    return jsonify(_decorate(p))


@app.route("/api/products/<pid>/refresh", methods=["POST"])
def api_refresh(pid):
    p = storage.get_product(pid)
    if not p:
        return jsonify({"error": "not found"}), 404
    scheduler.refresh_product(p)
    return jsonify(_decorate(storage.get_product(pid)))


@app.route("/api/products/<pid>/listings", methods=["DELETE"])
def api_remove_listing(pid):
    url = (request.json or {}).get("url", "")
    removed = storage.remove_listing(pid, url)
    if not removed:
        return jsonify({"error": "not found"}), 404
    return jsonify(_decorate(storage.get_product(pid)))


@app.route("/api/products/<pid>/refresh-one", methods=["POST"])
def api_refresh_one(pid):
    """Re-fetch a single pinned link (for link-by-link UI refresh)."""
    url = (request.json or {}).get("url", "")
    p = storage.get_product(pid)
    if not p:
        return jsonify({"error": "not found"}), 404
    listing = next((l for l in p["listings"] if l.get("url") == url), None)
    if not listing:
        return jsonify({"error": "link not found"}), 404
    old = listing.get("price")
    res = scraper.fetch_price(url)
    fields = {"last_checked": scheduler._now()}
    if res.get("price") is not None:
        fields["price"] = res["price"]
    fields["available"] = res.get("available", listing.get("available", True))
    updated = storage.update_listing(pid, url, fields)
    return jsonify({
        "url": url,
        "price": updated.get("price"),
        "available": updated.get("available", True),
        "old": old,
        "dropped": bool(old and updated.get("price") and updated["price"] < old),
        "error": res.get("error"),
        "min_price": _min_price(storage.get_product(pid)),
    })


@app.route("/api/notifications")
def api_notifications():
    return jsonify(scheduler.get_notifications(clear=request.args.get("clear") == "1"))


if __name__ == "__main__":
    scheduler.start()
    app.run(debug=True, port=5000)
