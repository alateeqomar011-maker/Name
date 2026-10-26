"""Accounts and sessions.

Everyone starts with an anonymous, private account bound to an http-only session cookie — no sign-up
is needed to practise. Adding an email and password is optional and only needed to use the same
recordings on another device. Passwords are hashed with scrypt; session tokens are stored hashed.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
import uuid
from collections import defaultdict, deque

from fastapi import HTTPException, Request, Response

from . import db
from .config import PLANS, settings

COOKIE = "murattil_session"
SESSION_DAYS = 365
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")


def _hash_token(tok: str) -> str:
    return hashlib.sha256(tok.encode()).hexdigest()


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, n, r, p, salt, dk = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=len(dk) // 2)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got.hex(), dk)


def create_user() -> str:
    uid = uuid.uuid4().hex
    db.run("INSERT INTO users(id, created_at) VALUES (?, ?)", uid, db.now())
    return uid


def create_session(user_id: str, response: Response) -> None:
    tok = secrets.token_urlsafe(32)
    t = db.now()
    db.run("INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen) VALUES (?,?,?,?,?)",
           _hash_token(tok), user_id, t, t + SESSION_DAYS * 86400, t)
    response.set_cookie(COOKIE, tok, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax",
                        secure=settings.secure_cookies, path="/")


def end_session(request: Request, response: Response) -> None:
    tok = request.cookies.get(COOKIE)
    if tok:
        db.run("DELETE FROM sessions WHERE token_hash = ?", _hash_token(tok))
    response.delete_cookie(COOKIE, path="/")


def user_from_request(request: Request) -> dict | None:
    tok = request.cookies.get(COOKIE)
    if not tok:
        return None
    row = db.one("SELECT u.*, s.expires_at, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id "
                 "WHERE s.token_hash = ?", _hash_token(tok))
    if row is None or row["expires_at"] < db.now():
        return None
    if db.now() - row["last_seen"] > 3600:
        db.run("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", db.now(), _hash_token(tok))
    return dict(row)


def current_user(request: Request) -> dict:
    """Dependency for endpoints that need an account. The SPA always calls /api/session first,
    which creates the anonymous account and cookie."""
    u = user_from_request(request)
    if u is None:
        raise HTTPException(401, "No session. Reload the page to start a new session.")
    return u


def plan_of(user: dict):
    return PLANS.get(user.get("plan") or "free", PLANS["free"])


# ------------------------------------------------------------------ brute-force protection

_attempts: dict[str, deque] = defaultdict(deque)
_attempts_lock = threading.Lock()


def throttle(key: str, limit: int = 8, window: float = 600) -> None:
    with _attempts_lock:
        q = _attempts[key]
        t = time.time()
        while q and t - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "Too many attempts. Please wait a few minutes and try again.")
        q.append(t)


def validate_credentials(email: str, password: str) -> str:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Please enter a valid email address.")
    if len(password or "") < 10:
        raise HTTPException(422, "Use a password of at least 10 characters.")
    if len(password) > 256:
        raise HTTPException(422, "Password is too long.")
    return email
