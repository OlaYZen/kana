/* js/backend.js — the optional backend: account, password and run reporting.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ==========================================================================
   Backend

   Entirely optional. The app is still the four static files it always was:
   if nothing answers /api/health — opened from a plain file server, or the
   server is down — `api.up` stays false, the account and progress buttons
   never appear, and everything runs on localStorage exactly as before.

   An account does not replace localStorage so much as outrank it: the local
   copy stays as the offline cache, and the server holds the copy that
   follows you between devices. Two things are held back from that trip and
   live under their own keys — the session token and the theme; both are
   declared and explained at the top of this file.
   ========================================================================== */
const api = {
  up: false,
  user: null,
  token: (function () {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  })(),

  setToken(t) {
    api.token = t;
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode — the session just won't outlive the tab */ }
  },

  call(method, path, body) {
    const opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    if (api.token) opts.headers.Authorization = "Bearer " + api.token;
    return fetch(path, opts).then((r) =>
      r.json().catch(() => ({})).then((data) => {
        if (r.status === 401 && api.token) signedOut();   // session expired
        if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
        return data;
      }));
  }
};

/* ---------- account ---------- */
let authMode = "login";
let pushTimer = 0;

function signedOut() {
  api.setToken(null);
  api.user = null;
  paintAccount();
}

function paintAccount() {
  el.accountBtn.classList.toggle("hidden", !api.up);
  el.statsBtn.classList.toggle("hidden", !api.up || !api.user);
  el.accountName.textContent = api.user || "Sign in";
  el.authSignedIn.classList.toggle("hidden", !api.user);
  el.authForm.classList.toggle("hidden", Boolean(api.user));
  el.authSwap.classList.toggle("hidden", Boolean(api.user));
  el.authBlurb.classList.toggle("hidden", Boolean(api.user));
  if (api.user) el.authWho.textContent = api.user;
  el.authTitle.textContent = api.user ? "Account"
    : authMode === "login" ? "Sign in" : "Create account";
  // Half-typed passwords must not survive a sign-out and be sitting there for
  // whoever signs in next.
  if (!api.user) closePasswordForm();
}

/* A submit button is never disabled to gate a form — it is always pressable
   and the check happens on submit, so the error can say what is actually
   wrong instead of leaving you guessing which field the button is waiting on.
   The one time it is disabled is *during* the request, to stop a second one,
   and then it says so: signing in runs 600k PBKDF2 rounds, which is long
   enough that a button that only greys out reads as a dead button. */
function busy(btn, label) {
  if (label) {
    if (btn.dataset.idle === undefined) btn.dataset.idle = btn.textContent;
    btn.textContent = label;
  } else if (btn.dataset.idle !== undefined) {
    btn.textContent = btn.dataset.idle;
    delete btn.dataset.idle;
  }
  btn.disabled = Boolean(label);
  btn.setAttribute("aria-busy", String(Boolean(label)));
}

// The message is announced by its own live region; this is what points a
// screen reader at it from the field, and marks the field as the thing to fix.
const markInvalid = (fields, bad) => fields.forEach((f) => {
  if (bad) f.setAttribute("aria-invalid", "true");
  else f.removeAttribute("aria-invalid");
});

function authError(msg) {
  el.authMsg.textContent = msg || "";
  el.authMsg.classList.toggle("hidden", !msg);
  markInvalid([el.authUser, el.authPass], Boolean(msg));
}

/* ---------- changing a password ----------
   Changing one, not recovering one. There is no email on file and no reset
   link, so knowing the current password is the whole of the proof — which is
   why the endpoint asks for it even though the caller already holds a valid
   session. A borrowed unlocked phone is exactly the case it is there for. */
function pwMessage(text, good) {
  el.pwMsg.textContent = text || "";
  el.pwMsg.classList.toggle("hidden", !text);
  el.pwMsg.classList.toggle("auth__msg--ok", Boolean(good));
  markInvalid([el.pwCurrent, el.pwNew, el.pwConfirm], Boolean(text) && !good);
}

function openPasswordForm() {
  el.pwForm.reset();
  pwMessage("");
  el.pwForm.classList.remove("hidden");
  el.pwToggle.classList.add("hidden");
  el.pwCurrent.focus();
}

// Deliberately leaves the message alone: the confirmation is shown *by*
// closing the form, so clearing it here would erase what just happened.
function closePasswordForm() {
  el.pwForm.reset();
  el.pwForm.classList.add("hidden");
  el.pwToggle.classList.remove("hidden");
}

function submitPassword(e) {
  if (e) e.preventDefault();
  const current = el.pwCurrent.value;
  const next = el.pwNew.value;
  const again = el.pwConfirm.value;

  if (!current || !next || !again) { pwMessage("Fill in all three fields."); return; }
  // Caught here rather than at the server: the second box exists to stop a
  // typo becoming a password nobody knows, which is a question about what was
  // typed on this screen and nothing the server can answer.
  if (next !== again) { pwMessage("The new passwords don't match."); return; }

  busy(el.pwSubmit, "Saving…");
  pwMessage("");
  api.call("POST", "/api/password",
           { current_password: current, new_password: next })
    .then((data) => {
      // The change dropped every session this account had, including the one
      // this device was using; the reply carries its replacement.
      api.setToken(data.token);
      closePasswordForm();
      pwMessage("Password changed. Every other device has been signed out.", true);
    })
    .catch((err) => pwMessage(err.message))
    .then(() => busy(el.pwSubmit, null));
}

function setAuthMode(mode) {
  authMode = mode;
  authError("");
  const idle = mode === "login" ? "Sign in" : "Create account";
  // If a request is in flight the button is showing its busy label; write the
  // new idle text where busy() will find it rather than over the top of it.
  if (el.authSubmit.dataset.idle !== undefined) el.authSubmit.dataset.idle = idle;
  else el.authSubmit.textContent = idle;
  el.authSwap.textContent = mode === "login"
    ? "No account yet? Create one"
    : "Already have an account? Sign in";
  el.authPass.autocomplete = mode === "login" ? "current-password" : "new-password";
  paintAccount();
}

// The server's copy wins on sign-in, except when it has nothing yet — then
// this device seeds it, so signing up doesn't throw away existing progress.
function pullState() {
  return api.call("GET", "/api/state").then((data) => {
    const prefs = data.prefs || {};
    if (Object.keys(prefs).length) {
      try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
      store.migrate();
    } else {
      return pushState();
    }
  });
}

function pushState() {
  if (!api.user) return Promise.resolve();
  return api.call("PUT", "/api/state", { prefs: store.read() }).catch(() => {});
}

// store.write fires on every setting change and every record; batch them.
function schedulePush() {
  if (!api.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 800);
}

// Pulling prefs rewrites localStorage, but `state` was read from the old copy
// at boot — every one of them has to be pushed back through its setter or the
// screen keeps showing the previous device's settings.
function applyStoredPrefs() {
  const saved = store.read();
  applyFont(saved.font);
  if (PROMPTS.includes(saved.prompt)) setPrompt(saved.prompt);
  if (DATE_FORMS.includes(saved.dates)) setDates(saved.dates);
  if (MODES.includes(saved.mode)) setMode(saved.mode);
  const known = SCRIPTS.indexOf(saved.script) > -1;
  const hasDecks = allDecks().some((d) => d.script === saved.script);
  if (known && hasDecks) setScript(saved.script);
  else buildMenu();     // records changed even if the script didn't
}

function afterSignIn(data) {
  api.setToken(data.token);
  api.user = data.username;
  authError("");
  el.authPass.value = "";
  return pullState().then(() => {
    applyStoredPrefs();
    paintAccount();
    toMenu();
  });
}

function submitAuth(e) {
  if (e) e.preventDefault();
  const username = el.authUser.value.trim();
  const password = el.authPass.value;
  if (!username || !password) { authError("Fill in both fields."); return; }
  busy(el.authSubmit, authMode === "login" ? "Signing in…" : "Creating…");
  authError("");
  api.call("POST", authMode === "login" ? "/api/login" : "/api/signup",
           { username: username, password: password })
    .then(afterSignIn)
    .catch((err) => authError(err.message))
    .then(() => busy(el.authSubmit, null));
}

/* ---------- run reporting ---------- */
// Posted whole, once, at the end of a run rather than card by card: a run
// that was abandoned halfway is not evidence of anything.
function reportRun() {
  if (!api.user || !state.answers.length) return;
  api.call("POST", "/api/runs", {
    deck_id: state.deck.id,
    mode: activeMode(),
    script: state.deck.script || null,
    device: DEVICE,
    is_drill: state.isDrill,
    duration_ms: Math.round(elapsed()),
    answers: state.answers
  }).catch(() => {});   // analytics are never worth interrupting practice for
}
