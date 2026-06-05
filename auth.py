"""Authentication: Flask-Login setup + register/login/logout routes.

Email + password, password hashed with werkzeug. Sessions via Flask-Login.
"""
import re

from flask import Blueprint, jsonify, request, render_template, redirect, url_for
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

import storage

login_manager = LoginManager()
auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def init_login(app):
    login_manager.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        # API calls get JSON 401; page requests are redirected to the login page.
        if request.path.startswith("/api/"):
            return jsonify({"error": "unauthorized"}), 401
        return redirect(url_for("auth.login_page"))

    @login_manager.user_loader
    def load_user(user_id):
        return storage.get_user(int(user_id))


def _user_json(user):
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "joined_at": user.created_at.isoformat() if user.created_at else None,
    }


@auth_bp.route("/login")
def login_page():
    return render_template("login.html")


@auth_bp.route("/api/auth/me")
def me():
    if current_user.is_authenticated:
        return jsonify(_user_json(current_user))
    return jsonify({"error": "unauthorized"}), 401


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    body = request.json or {}
    email = (body.get("email") or "").strip().lower()
    nickname = (body.get("nickname") or "").strip()
    password = body.get("password") or ""
    password2 = body.get("password2") or ""
    if not EMAIL_RE.match(email):
        return jsonify({"error": "invalid_email"}), 400
    if not (2 <= len(nickname) <= 40):
        return jsonify({"error": "invalid_nickname"}), 400
    if len(password) < 8:
        return jsonify({"error": "weak_password"}), 400
    if password != password2:
        return jsonify({"error": "password_mismatch"}), 400
    if storage.get_user_by_email(email):
        return jsonify({"error": "email_taken"}), 409
    user = storage.create_user(email, nickname, generate_password_hash(password))
    login_user(user)
    return jsonify(_user_json(user)), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    body = request.json or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    user = storage.get_user_by_email(email)
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "invalid_credentials"}), 401
    login_user(user, remember=True)
    return jsonify(_user_json(user))


@auth_bp.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True})
