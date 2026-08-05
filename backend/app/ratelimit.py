"""Failed-attempt throttling for the sign-in endpoints.

In-process and in-memory: one server, one SQLite file, no Redis to stand up.
Counters reset when the server restarts, which is the right trade for a home
network — the point is to make guessing slow, not to keep a permanent ledger.

Only *failures* are counted, and a success clears the counter, so someone
typing their own password correctly is never throttled no matter how often
they sign in.

Two keys are checked per attempt:

* **Per IP** is the real limit. It stops one machine grinding through a
  password list, and it also caps the CPU cost of the attempt, since verifying
  a password is 600k PBKDF2 rounds on purpose.
* **Per username** is a loose backstop for guessing spread across several
  addresses. It is deliberately much slacker than the IP limit: a strict one
  would let anybody lock a user out of their own account just by submitting
  rubbish passwords for their name, which trades a small attack for a much
  more annoying one.

Behind a reverse proxy every request appears to come from the proxy, which
collapses the per-IP limit into a global one. Run uvicorn with --proxy-headers
and --forwarded-allow-ips set to the proxy if that ever applies; do not trust
X-Forwarded-For otherwise, since anyone can send it.
"""
import threading
import time

# failures, and the window they are counted over
IP_LIMIT, IP_WINDOW = 10, 15 * 60
USER_LIMIT, USER_WINDOW = 25, 15 * 60
# signups count successes too, not just failures — the limit is on how fast
# accounts can be created at all, so one address can't fill the database
SIGNUP_LIMIT, SIGNUP_WINDOW = 20, 60 * 60
# Changing a password also verifies one, so it is guessable and it costs the
# same 600k rounds. Keyed by account rather than by IP: you need a live session
# to reach the endpoint at all, so the attacker worth stopping is someone at an
# already-signed-in device trying to guess their way into owning the account.
# That also caps the CPU, since the key they'd be hammering is the one bucket.
PASSWORD_LIMIT, PASSWORD_WINDOW = 10, 15 * 60


class AttemptLimiter:
    """A sliding window of recent failures per key."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _fresh(self, key: str, now: float) -> list[float]:
        return [t for t in self._hits.get(key, ()) if t > now - self.window]

    def retry_after(self, key: str) -> int:
        """Seconds to wait, or 0 when the caller may proceed."""
        now = time.monotonic()
        with self._lock:
            hits = self._fresh(key, now)
            if len(hits) < self.limit:
                return 0
            # the window slides, so the wait is until the oldest hit ages out
            return max(1, int(hits[0] + self.window - now) + 1)

    def record(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._fresh(key, now)
            hits.append(now)
            self._hits[key] = hits
            # opportunistic sweep so an attacker cycling keys can't grow this
            # dictionary without bound
            if len(self._hits) > 4096:
                for k in [k for k, v in self._hits.items()
                          if not v or v[-1] <= now - self.window]:
                    self._hits.pop(k, None)

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


login_ip = AttemptLimiter(IP_LIMIT, IP_WINDOW)
login_user = AttemptLimiter(USER_LIMIT, USER_WINDOW)
signup_ip = AttemptLimiter(SIGNUP_LIMIT, SIGNUP_WINDOW)
# deliberately its own bucket, not login_user's: a fumbled password change must
# not be what stops you signing in on your phone
password_user = AttemptLimiter(PASSWORD_LIMIT, PASSWORD_WINDOW)


def client_ip(request) -> str:
    return request.client.host if request and request.client else "unknown"
