"""PriceStalk - Flask backend (app factory)."""
from flask import Flask, jsonify, render_template, request

from config import Config
from models import init_db
from presenter import decorate, min_price
import storage
import scraper
import scheduler


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)
    init_db(app.config["DATABASE_URL"])
    register_routes(app)
    return app


def register_routes(app):

    @app.route("/")
    def index():
        return render_template("index.html")

    # ----------------------------------------------------------- wizard

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

    @app.route("/api/drafts/<did>", methods=["DELETE"])
    def api_discard(did):
        return jsonify({"discarded": storage.discard_draft(did)})

    # --------------------------------------------------------- entities

    @app.route("/api/products")
    def api_products():
        return jsonify([decorate(p) for p in storage.list_products()])

    @app.route("/api/products", methods=["POST"])
    def api_create():
        body = request.json or {}
        query = (body.get("query") or "").strip()
        listings = body.get("listings") or []
        if not query:
            return jsonify({"error": "query required"}), 400
        product = storage.create_product(query, listings)
        return jsonify(decorate(product)), 201

    @app.route("/api/products/<pid>/links", methods=["POST"])
    def api_add_links(pid):
        listings = (request.json or {}).get("listings") or []
        product = storage.add_listings(pid, listings)
        if not product:
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(product))

    @app.route("/api/products/<pid>")
    def api_product(pid):
        p = storage.get_product(pid)
        if not p:
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(p))

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
        return jsonify(decorate(p))

    @app.route("/api/products/<pid>/refresh", methods=["POST"])
    def api_refresh(pid):
        """Re-fetch all of a product's listings in one request (busy-guarded)."""
        if not storage.get_product(pid):
            return jsonify({"error": "not found"}), 404
        product = scheduler.refresh_product_guarded(pid)
        if product is None:   # already refreshing
            return jsonify({"error": "busy"}), 409
        return jsonify(decorate(product))

    @app.route("/api/products/<pid>/listings", methods=["DELETE"])
    def api_remove_listing(pid):
        url = (request.json or {}).get("url", "")
        if not storage.remove_listing(pid, url):
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(storage.get_product(pid)))

    @app.route("/api/notifications")
    def api_notifications():
        return jsonify(scheduler.get_notifications(clear=request.args.get("clear") == "1"))


# WSGI entrypoint (gunicorn: `gunicorn app:app`)
app = create_app()

if __name__ == "__main__":
    # Running directly = local dev: enable reloader/debugger + scheduler.
    scheduler.start(app.config["REFRESH_HOURS"])
    app.run(debug=True, port=5000)
