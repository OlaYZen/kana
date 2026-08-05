"""Accounts and sessions.

Password hashing is PBKDF2-HMAC-SHA256 from the standard library rather than
bcrypt/argon2, so `pip install` needs no compiler and the whole backend stays
three pure dependencies. Iterations follow the current OWASP figure.

Sessions are opaque random tokens. Only their SHA-256 is stored, so a copy of
the database does not hand over live logins.
"""
import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

ITERATIONS = 600_000
SESSION_DAYS = 90
MIN_PASSWORD = 8
MAX_PASSWORD = 200          # PBKDF2 on an unbounded string is a free CPU burn
MAX_USERNAME = 32


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------- passwords ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, want_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters)
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(dk.hex(), want_hex)


def validate_credentials(username: str, password: str) -> str | None:
    """Returns an error message, or None when acceptable."""
    username = (username or "").strip()
    if not 3 <= len(username) <= MAX_USERNAME:
        return f"Username must be 3–{MAX_USERNAME} characters."
    if not all(c.isalnum() or c in "_-." for c in username):
        return "Username can use letters, numbers, and _ - . only."
    if len(password or "") < MIN_PASSWORD:
        return f"Password must be at least {MIN_PASSWORD} characters."
    if len(password) > MAX_PASSWORD:
        return f"Password must be at most {MAX_PASSWORD} characters."
    return None


# ---------- sessions ----------

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
        (_token_hash(token), user_id, iso(now()), iso(now() + timedelta(days=SESSION_DAYS))),
    )
    return token


def user_for_token(conn: sqlite3.Connection, token: str) -> sqlite3.Row | None:
    if not token:
        return None
    row = conn.execute(
        """SELECT u.id, u.username, s.expires_at
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?""",
        (_token_hash(token),),
    ).fetchone()
    if not row:
        return None
    if datetime.fromisoformat(row["expires_at"]) < now():
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
        return None
    return row


def destroy_session(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def purge_expired(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (iso(now()),))
