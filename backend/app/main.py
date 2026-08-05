"""FastAPI app: accounts, saved state, run logging, analytics — and it serves
the front end itself, so there is one origin and no CORS to configure.

There are no admin routes and no admin flag. Every query is scoped to the
authenticated user; a user can only ever read their own rows.
"""
import json
import sqlite3
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import analytics, auth, db, ratelimit

ROOT = Path(__file__).resolve().parents[2]

app = FastAPI(title="Kana Practice", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.on_event("startup")
def _startup() -> None:
    db.init()
    with db.session() as conn:
        auth.purge_expired(conn)


# ---------------------------------------------------------------- models

class Credentials(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=auth.MAX_PASSWORD)


class StatePatch(BaseModel):
    prefs: dict[str, Any]


class PasswordChange(BaseModel):
    # The confirm field is a UI concern and stays there — the two boxes exist to
    # catch a typo before it becomes a password nobody knows, and the server has
    # nothing to add to that.
    current_password: str = Field(max_length=auth.MAX_PASSWORD)
    new_password: str = Field(max_length=auth.MAX_PASSWORD)


class AnswerIn(BaseModel):
    q: str = Field(max_length=16)
    a: str = Field(max_length=64)
    given: str | None = Field(default=None, max_length=64)
    correct: bool
    revealed: bool = False
    ms: int = Field(ge=0, le=6 * 60 * 60 * 1000)


class RunIn(BaseModel):
    deck_id: str = Field(max_length=64)
    mode: str = Field(max_length=16)
    script: str | None = Field(default=None, max_length=16)
    device: Literal["mobile", "desktop"]
    is_drill: bool = False
    duration_ms: int = Field(ge=0)
    answers: list[AnswerIn] = Field(max_length=500)


# ---------------------------------------------------------------- auth dep

def bearer(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        return ""
    return authorization[7:].strip()


def current_user(token: Annotated[str, Depends(bearer)]) -> dict:
    if not token:
        raise HTTPException(401, "Not signed in")
    with db.session() as conn:
        row = auth.user_for_token(conn, token)
        if not row:
            raise HTTPException(401, "Session expired")
        return {"id": row["id"], "username": row["username"]}


User = Annotated[dict, Depends(current_user)]


# ---------------------------------------------------------------- accounts

@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


def _throttle(limiter: ratelimit.AttemptLimiter, key: str, what: str) -> None:
    wait = limiter.retry_after(key)
    if wait:
        raise HTTPException(
            429,
            f"Too many {what}. Try again in {wait} second{'' if wait == 1 else 's'}.",
            headers={"Retry-After": str(wait)},
        )


@app.post("/api/signup")
def signup(body: Credentials, request: Request) -> dict:
    ip = ratelimit.client_ip(request)
    # otherwise a network-reachable server can be filled with junk accounts
    _throttle(ratelimit.signup_ip, ip, "new accounts from here")
    err = auth.validate_credentials(body.username, body.password)
    if err:
        raise HTTPException(400, err)
    username = body.username.strip()
    with db.session() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)",
                (username, auth.hash_password(body.password), auth.iso(auth.now())),
            )
        except sqlite3.IntegrityError:
            ratelimit.signup_ip.record(ip)
            raise HTTPException(409, "That username is taken.")
        user_id = cur.lastrowid
        conn.execute(
            "INSERT INTO state (user_id, prefs, updated_at) VALUES (?,?,?)",
            (user_id, "{}", auth.iso(auth.now())),
        )
        token = auth.create_session(conn, user_id)
        ratelimit.signup_ip.record(ip)
    return {"token": token, "username": username}


@app.post("/api/login")
def login(body: Credentials, request: Request) -> dict:
    ip = ratelimit.client_ip(request)
    name = body.username.strip().lower()

    # Checked before the password is verified, so a throttled attempt costs no
    # PBKDF2 work — the throttle protects the CPU as much as the account.
    _throttle(ratelimit.login_ip, ip, "sign-in attempts from here")
    _throttle(ratelimit.login_user, name, "sign-in attempts for that account")

    with db.session() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (body.username.strip(),),
        ).fetchone()
        # Same message and the same work either way, so a wrong username and a
        # wrong password are indistinguishable from outside.
        if not row or not auth.verify_password(body.password, row["password_hash"]):
            ratelimit.login_ip.record(ip)
            ratelimit.login_user.record(name)
            raise HTTPException(401, "Wrong username or password.")
        # Proving you own the account clears the count, so normal use — even
        # after a few fumbled attempts — is never throttled.
        ratelimit.login_ip.clear(ip)
        ratelimit.login_user.clear(name)
        token = auth.create_session(conn, row["id"])
        return {"token": token, "username": row["username"]}


@app.post("/api/logout")
def logout(token: Annotated[str, Depends(bearer)]) -> dict:
    if token:
        with db.session() as conn:
            auth.destroy_session(conn, token)
    return {"ok": True}


@app.post("/api/password")
def change_password(body: PasswordChange, user: User) -> dict:
    """Change a known password. This is not a reset — there is no recovery flow
    and no email on file, so proving you already know the current one is the
    only thing standing between a borrowed session and a stolen account."""
    key = str(user["id"])
    # Before the verify, exactly as sign-in does: a throttled attempt should
    # cost no PBKDF2 work, so the limit protects the CPU as well as the account.
    _throttle(ratelimit.password_user, key, "password attempts for this account")

    err = auth.validate_password(body.new_password)
    if err:
        raise HTTPException(400, err)

    with db.session() as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        if not row or not auth.verify_password(body.current_password, row["password_hash"]):
            ratelimit.password_user.record(key)
            # 400 and not 401 on purpose: the client signs itself out on a 401,
            # so returning one here would log you out for a typo.
            raise HTTPException(400, "That isn't your current password.")
        if body.current_password == body.new_password:
            raise HTTPException(400, "That's the password you already have.")

        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (auth.hash_password(body.new_password), user["id"]),
        )
        # Every session dies, including this one, and a fresh one is issued for
        # the device that made the change — so the caller stays signed in and
        # everywhere else has to log in again with the new password.
        auth.destroy_user_sessions(conn, user["id"])
        new_token = auth.create_session(conn, user["id"])

    ratelimit.password_user.clear(key)
    return {"token": new_token, "username": user["username"]}


@app.get("/api/me")
def me(user: User) -> dict:
    return {"username": user["username"]}


@app.delete("/api/me")
def delete_account(user: User) -> dict:
    """Everything cascades from users, so this really does remove it all."""
    with db.session() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    return {"ok": True}


# ---------------------------------------------------------------- state

@app.get("/api/state")
def get_state(user: User) -> dict:
    with db.session() as conn:
        row = conn.execute("SELECT prefs FROM state WHERE user_id = ?", (user["id"],)).fetchone()
    try:
        prefs = json.loads(row["prefs"]) if row else {}
    except ValueError:
        prefs = {}
    return {"prefs": prefs}


@app.put("/api/state")
def put_state(body: StatePatch, user: User) -> dict:
    """Whole-blob replace. The client owns the merge, exactly as the `store`
    helper already does locally, so the two can't disagree on merge rules."""
    with db.session() as conn:
        conn.execute(
            """INSERT INTO state (user_id, prefs, updated_at) VALUES (?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs,
                                                  updated_at = excluded.updated_at""",
            (user["id"], json.dumps(body.prefs), auth.iso(auth.now())),
        )
    return {"ok": True}


# ---------------------------------------------------------------- runs

@app.post("/api/runs")
def post_run(body: RunIn, user: User) -> dict:
    with db.session() as conn:
        cur = conn.execute(
            """INSERT INTO runs
                 (user_id, deck_id, mode, script, device, is_drill,
                  total, correct, duration_ms, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                user["id"], body.deck_id, body.mode, body.script, body.device,
                int(body.is_drill), len(body.answers),
                sum(1 for a in body.answers if a.correct),
                body.duration_ms, auth.iso(auth.now()),
            ),
        )
        run_id = cur.lastrowid
        conn.executemany(
            """INSERT INTO answers
                 (run_id, user_id, device, mode, deck_id, q, a, given,
                  correct, revealed, ms, timed)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                (
                    run_id, user["id"], body.device, body.mode, body.deck_id,
                    a.q, a.a, a.given, int(a.correct), int(a.revealed), a.ms,
                    # A revealed card was never really answered, and one left
                    # sitting past the cap was not being looked at. Neither is
                    # evidence of speed; both still count towards accuracy.
                    int(not a.revealed and a.ms <= analytics.MAX_CARD_MS),
                )
                for a in body.answers
            ],
        )
    return {"ok": True, "run_id": run_id}


@app.get("/api/analytics")
def get_analytics(user: User, device: str | None = None, deck: str | None = None) -> dict:
    with db.session() as conn:
        if device:
            if device not in analytics.DEVICES:
                raise HTTPException(400, "device must be mobile or desktop")
            if deck:
                return {device: {"device": device,
                                 "decks": [analytics.report(conn, user["id"], device, deck)]}}
            return {device: analytics.device_report(conn, user["id"], device)}
        return analytics.overview(conn, user["id"])


# ---------------------------------------------------------------- static

@app.exception_handler(HTTPException)
def http_error(request: Request, exc: HTTPException) -> JSONResponse:
    # exc.headers must be carried through, or the Retry-After on a 429 is lost
    # and the client is told to wait without being told how long.
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code,
                        headers=exc.headers)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


# Mounted last so every /api route above wins. html=True serves index.html for
# unknown paths, which keeps a refresh on any URL working.
app.mount("/", StaticFiles(directory=ROOT, html=True), name="static")
