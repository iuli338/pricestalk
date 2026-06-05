"""PriceStalk - Flask backend (app factory)."""
from flask import Flask, jsonify, render_template, request
from flask_login import login_required, current_user

from config import Config
from models import init_db
from presenter import decorate, min_price
from auth import login_manager, auth_bp, init_login
import storage
import scraper
import scheduler


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)
    init_db(app.config["DATABASE_URL"])
    init_login(app)
    app.register_blueprint(auth_bp)
    register_routes(app)
    return app


def register_routes(app):

    @app.route("/")
    @login_required
    def index():
        return render_template("index.html")

    # ----------------------------------------------------------- wizard

    @app.route("/api/scout", methods=["POST"])
    @login_required
    def api_scout():
        query = (request.json or {}).get("query", "").strip()
        if not query:
            return jsonify({"error": "query required"}), 400
        results = scraper.scout_all(query)
        draft = storage.create_draft(query, results)
        return jsonify(draft), 201

    @app.route("/api/drafts/<did>")
    @login_required
    def api_draft(did):
        draft = storage.get_draft(did)
        if not draft:
            return jsonify({"error": "not found"}), 404
        return jsonify(draft)

    @app.route("/api/drafts/<did>", methods=["DELETE"])
    @login_required
    def api_discard(did):
        return jsonify({"discarded": storage.discard_draft(did)})

    # --------------------------------------------------------- entities
    # All product routes are scoped to the logged-in user.

    @app.route("/api/products")
    @login_required
    def api_products():
        return jsonify([decorate(p) for p in storage.list_products(current_user.id)])

    @app.route("/api/products", methods=["POST"])
    @login_required
    def api_create():
        body = request.json or {}
        query = (body.get("query") or "").strip()
        listings = body.get("listings") or []
        if not query:
            return jsonify({"error": "query required"}), 400
        product = storage.create_product(current_user.id, query, listings)
        return jsonify(decorate(product)), 201

    @app.route("/api/products/<pid>/links", methods=["POST"])
    @login_required
    def api_add_links(pid):
        listings = (request.json or {}).get("listings") or []
        product = storage.add_listings(current_user.id, pid, listings)
        if not product:
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(product))

    @app.route("/api/products/<pid>")
    @login_required
    def api_product(pid):
        p = storage.get_product(current_user.id, pid)
        if not p:
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(p))

    @app.route("/api/products/<pid>", methods=["DELETE"])
    @login_required
    def api_delete(pid):
        return jsonify({"deleted": storage.delete_product(current_user.id, pid)})

    @app.route("/api/products/<pid>", methods=["PATCH"])
    @login_required
    def api_update(pid):
        body = request.json or {}
        fields = {}
        if "title" in body:
            existing = storage.get_product(current_user.id, pid)
            if not existing:
                return jsonify({"error": "not found"}), 404
            fields["title"] = (body["title"] or "").strip() or existing["query"]
        if "cover_image" in body:
            fields["cover_image"] = body["cover_image"]
        p = storage.update_product(current_user.id, pid, fields)
        if not p:
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(p))

    @app.route("/api/products/<pid>/refresh", methods=["POST"])
    @login_required
    def api_refresh(pid):
        """Re-fetch all of a product's listings in one request (busy-guarded)."""
        if not storage.get_product(current_user.id, pid):
            return jsonify({"error": "not found"}), 404
        product = scheduler.refresh_product_guarded(current_user.id, pid)
        if product is None:   # already refreshing
            return jsonify({"error": "busy"}), 409
        return jsonify(decorate(product))

    @app.route("/api/products/<pid>/listings", methods=["DELETE"])
    @login_required
    def api_remove_listing(pid):
        url = (request.json or {}).get("url", "")
        if not storage.remove_listing(current_user.id, pid, url):
            return jsonify({"error": "not found"}), 404
        return jsonify(decorate(storage.get_product(current_user.id, pid)))

    @app.route("/api/notifications")
    @login_required
    def api_notifications():
        return jsonify(scheduler.get_notifications(clear=request.args.get("clear") == "1"))


# WSGI entrypoint (gunicorn: `gunicorn app:app`)
app = create_app()

if __name__ == "__main__":
    # Running directly = local dev: enable reloader/debugger + scheduler.
    scheduler.start(app.config["REFRESH_HOURS"])
    app.run(debug=True, port=5000)
