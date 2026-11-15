/**
 * Minimal stub API for the Elric frontend Playwright tests ONLY.
 *
 * Implements the v1.1 auth contract against which the frontend is built:
 *  - POST /api/auth/register {email,password} -> 201 {access_token, user}
 *  - POST /api/auth/login {email,password} -> 200 {access_token, user}
 *  - POST /api/auth/refresh (elric_refresh HttpOnly cookie) -> {access_token}
 *  - POST /api/auth/logout, GET /api/auth/me
 *  - POST /api/auth/change-password (revokes all sessions)
 *  - POST /api/auth/complete-onboarding
 *  - GET/PUT /api/settings, GET/POST/PUT/DELETE /api/vendors
 *    (registry) + GET /api/vendors/registry; GET /api/vendors returns
 *    invoice-derived open-balance summaries, mirroring the real backend.
 *  - POST /api/invoices/upload (accepts the file, returns a stored invoice)
 *  - POST /api/invoices/:id/retry-extraction (202; simulates the
 *    background re-run finishing as a flagged, extracted invoice)
 *  - POST /api/_test/seed-parked-invoice {kind} (test seam: an on_hold
 *    invoice carrying a real extraction_error / extraction_error_kind)
 *  - POST /api/_test/reset (test seam: wipe stub vendors + invoices so
 *    a suite can start hermetic; users/sessions are NOT cleared)
 *  - All other /api/* -> 401 when unauthenticated.
 *
 * Access token: HMAC-signed, short expiry (STUB_ACCESS_TTL_SECONDS, default
 * 900 — the Playwright config sets it to 5 so expiry/refresh is exercised).
 * Refresh token: random opaque token in an HttpOnly `elric_refresh` cookie;
 * rotation on every refresh, replay of a rotated token -> 401 and the whole
 * token family is revoked (reuse rejection).
 *
 * Passwords are stored as a salted one-way hash (test-only, never shipped
 * in src/). In-memory only; state resets on restart. Never run against
 * production data.
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.STUB_PORT ?? 18001);
const ACCESS_TTL_SECONDS = Number(process.env.STUB_ACCESS_TTL_SECONDS ?? 900);
const LOCKOUT_MS = Number(process.env.STUB_LOCKOUT_MS ?? 15 * 60 * 1000);
const SECRET = "stub-only-secret-not-for-production";

/* ------------------------------------------------------------------ state */

let userSeq = 1;
let vendorSeq = 1;
let invoiceSeq = 1;

/** email -> {id, email, salt, hash, pwVersion, onboarding_completed} */
const users = new Map();
/** refresh token -> {userId} (current, valid tokens) */
const refreshTokens = new Map();
/** rotated refresh tokens: token -> userId (replay -> 401 + revoke family) */
const usedRefreshTokens = new Map();
/** email -> {count, lockedUntil} */
const failedLogins = new Map();

let settings = {
  company_name: "",
  country: "India",
  state: "Karnataka",
  currency: "INR",
  auto_approve_limit_inr: 50000,
  tolerance_pct: 2,
  tolerance_flat_inr: 500,
  duplicate_window_days: 90,
};
let vendors = [];
let invoices = [];

/* -------------------------------------------------------------- passwords */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

const PASSWORD_RULES = [
  { key: "length", test: (pw) => pw.length >= 12 },
  { key: "upper", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", test: (pw) => /[a-z]/.test(pw) },
  { key: "digit", test: (pw) => /[0-9]/.test(pw) },
  { key: "symbol", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function passwordValid(pw) {
  return typeof pw === "string" && PASSWORD_RULES.every((r) => r.test(pw));
}

function emailValid(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ------------------------------------------------------------------ tokens */

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function issueAccessToken(user) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      v: user.pwVersion,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
    }),
  );
  const sig = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function verifyAccessToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (data.exp * 1000 < Date.now()) return null;
  const user = [...users.values()].find((u) => u.id === data.sub);
  if (!user || user.pwVersion !== data.v) return null;
  return user;
}

function issueRefreshToken(user) {
  const token = crypto.randomBytes(32).toString("hex");
  refreshTokens.set(token, { userId: user.id });
  return token;
}

function revokeUserRefreshTokens(userId) {
  for (const [token, info] of refreshTokens) {
    if (info.userId === userId) refreshTokens.delete(token);
  }
}

function refreshCookieHeader(token) {
  const attrs = ["elric_refresh=" + token, "HttpOnly", "Path=/", "Max-Age=" + 7 * 24 * 60 * 60, "SameSite=Lax"];
  return attrs.join("; ");
}

function clearRefreshCookieHeader() {
  return "elric_refresh=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k) out[k] = rest.join("=");
  }
  return out;
}

function authedUser(req) {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  return verifyAccessToken(match[1]);
}

/* -------------------------------------------------------------------- http */

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ _raw: raw });
      }
    });
  });
}

function publicUser(user) {
  return { id: user.id, email: user.email, onboarding_completed: user.onboarding_completed };
}

function issueAuthPair(res, user) {
  const access = issueAccessToken(user);
  const refresh = issueRefreshToken(user);
  return { access, refresh };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  const path = url.pathname;
  const method = req.method;

  if (path === "/health") {
    send(res, 200, { status: "ok" });
    return;
  }

  /* ------------------------------------------------------------ auth */
  if (path === "/api/auth/register" && method === "POST") {
    const body = await readBody(req);
    if (!emailValid(body.email)) {
      send(res, 422, { detail: "Enter a valid email address." });
      return;
    }
    if (!passwordValid(body.password)) {
      send(res, 422, {
        detail:
          "Password must be at least 12 characters with an uppercase letter, a lowercase letter, a digit and a symbol.",
      });
      return;
    }
    if (users.has(body.email)) {
      send(res, 409, { detail: "An account with this email already exists." });
      return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      id: `u${userSeq++}`,
      email: body.email,
      salt,
      hash: hashPassword(body.password, salt),
      pwVersion: 1,
      onboarding_completed: false,
    };
    users.set(user.email, user);
    const { access, refresh } = issueAuthPair(res, user);
    send(res, 201, { access_token: access, user: publicUser(user) }, { "Set-Cookie": refreshCookieHeader(refresh) });
    return;
  }

  if (path === "/api/auth/login" && method === "POST") {
    const body = await readBody(req);
    const record = failedLogins.get(body.email);
    if (record && record.lockedUntil > Date.now()) {
      send(res, 429, { detail: "Too many attempts — try again in 15 minutes" });
      return;
    }
    const user = users.get(body.email);
    const ok = !!user && crypto.timingSafeEqual(Buffer.from(hashPassword(body.password ?? "", user.salt)), Buffer.from(user.hash));
    if (!ok) {
      const next = { count: (record?.count ?? 0) + 1, lockedUntil: 0 };
      if (next.count >= 5) next.lockedUntil = Date.now() + LOCKOUT_MS;
      failedLogins.set(body.email, next);
      if (next.count >= 5) {
        send(res, 429, { detail: "Too many attempts — try again in 15 minutes" });
      } else {
        send(res, 401, { detail: "Invalid email or password" });
      }
      return;
    }
    failedLogins.delete(body.email);
    const { access, refresh } = issueAuthPair(res, user);
    send(res, 200, { access_token: access, user: publicUser(user) }, { "Set-Cookie": refreshCookieHeader(refresh) });
    return;
  }

  if (path === "/api/auth/refresh" && method === "POST") {
    const token = parseCookies(req).elric_refresh;
    if (!token) {
      send(res, 401, { detail: "No refresh session." });
      return;
    }
    if (usedRefreshTokens.has(token)) {
      // Reuse of a rotated token: revoke the whole family, reject.
      const userId = usedRefreshTokens.get(token);
      usedRefreshTokens.delete(token);
      if (userId) revokeUserRefreshTokens(userId);
      send(res, 401, { detail: "Refresh token already used." });
      return;
    }
    const info = refreshTokens.get(token);
    if (!info) {
      send(res, 401, { detail: "Invalid refresh session." });
      return;
    }
    const user = [...users.values()].find((u) => u.id === info.userId);
    if (!user) {
      send(res, 401, { detail: "Invalid refresh session." });
      return;
    }
    // Rotate: old token becomes single-use-rejected, new token issued.
    refreshTokens.delete(token);
    usedRefreshTokens.set(token, user.id);
    const access = issueAccessToken(user);
    const refresh = issueRefreshToken(user);
    send(res, 200, { access_token: access }, { "Set-Cookie": refreshCookieHeader(refresh) });
    return;
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const token = parseCookies(req).elric_refresh;
    if (token) {
      refreshTokens.delete(token);
      usedRefreshTokens.delete(token);
    }
    send(res, 200, { ok: true }, { "Set-Cookie": clearRefreshCookieHeader() });
    return;
  }

  if (path === "/api/auth/me" && method === "GET") {
    const user = authedUser(req);
    if (!user) {
      send(res, 401, { detail: "Not authenticated." });
      return;
    }
    send(res, 200, publicUser(user));
    return;
  }

  if (path === "/api/auth/change-password" && method === "POST") {
    const user = authedUser(req);
    if (!user) {
      send(res, 401, { detail: "Not authenticated." });
      return;
    }
    const body = await readBody(req);
    const currentOk = crypto.timingSafeEqual(
      Buffer.from(hashPassword(body.current_password ?? "", user.salt)),
      Buffer.from(user.hash),
    );
    if (!currentOk) {
      send(res, 401, { detail: "Current password is incorrect." });
      return;
    }
    if (!passwordValid(body.new_password)) {
      send(res, 422, {
        detail:
          "Password must be at least 12 characters with an uppercase letter, a lowercase letter, a digit and a symbol.",
      });
      return;
    }
    user.hash = hashPassword(body.new_password, user.salt);
    user.pwVersion += 1;
    revokeUserRefreshTokens(user.id);
    send(res, 200, { ok: true }, { "Set-Cookie": clearRefreshCookieHeader() });
    return;
  }

  if (path === "/api/auth/complete-onboarding" && method === "POST") {
    const user = authedUser(req);
    if (!user) {
      send(res, 401, { detail: "Not authenticated." });
      return;
    }
    user.onboarding_completed = true;
    send(res, 200, { onboarding_completed: true });
    return;
  }

  /* ------------------------------------------------- authenticated APIs */
  if (path === "/api/_test/reset" && method === "POST") {
    // Test-only seam (stub API only, never shipped in src/): wipe stub
    // vendors + invoices so a suite can start hermetic. Deliberately
    // unauthenticated and placed BEFORE the auth gate — it runs before
    // any user exists. Users/sessions are NOT cleared (a mid-test reset
    // would strand the browser's refresh cookie).
    vendors = [];
    invoices = [];
    send(res, 200, { ok: true });
    return;
  }
  if (path.startsWith("/api/")) {
    const user = authedUser(req);
    if (!user) {
      send(res, 401, { detail: "Not authenticated." });
      return;
    }

    if (path === "/api/settings" && method === "GET") {
      send(res, 200, settings);
      return;
    }
    if (path === "/api/settings" && method === "PUT") {
      const body = await readBody(req);
      settings = {
        company_name: String(body.company_name ?? ""),
        country: String(body.country ?? "India"),
        state: String(body.state ?? ""),
        currency: String(body.currency ?? "INR"),
        auto_approve_limit_inr: Number(body.auto_approve_limit_inr ?? 0),
        tolerance_pct: Number(body.tolerance_pct ?? 0),
        tolerance_flat_inr: Number(body.tolerance_flat_inr ?? 0),
        duplicate_window_days: Number(body.duplicate_window_days ?? 0),
      };
      send(res, 200, settings);
      return;
    }

    if (path === "/api/vendors/registry" && method === "GET") {
      // The vendor registry — what onboarding step 4 and Settings create.
      // Registered BEFORE the /api/vendors/:id route below, or the
      // path-param route would swallow "registry" as an id.
      send(res, 200, vendors);
      return;
    }
    if (path === "/api/vendors" && method === "GET") {
      // Invoice-derived open-balance summaries, mirroring the real
      // backend (backend/app/api/routes.py vendor_summaries): open
      // statuses only, rows with no vendor at all skipped.
      const openStatuses = new Set([
        "received", "extracted", "validated", "matched", "flagged",
        "approved", "posted", "scheduled", "on_hold",
      ]);
      const byVendor = new Map();
      for (const inv of invoices) {
        if (!openStatuses.has(inv.status)) continue;
        if (!inv.vendor_id && !inv.vendor_name) continue;
        const key = inv.vendor_id;
        const entry = byVendor.get(key) ?? {
          vendor_id: inv.vendor_id,
          vendor_name: inv.vendor_name || inv.vendor_id,
          open_balance_inr: 0,
          open_count: 0,
          last_invoice_date: null,
        };
        entry.open_balance_inr += Number(inv.total ?? 0);
        entry.open_count += 1;
        if (inv.invoice_date && (!entry.last_invoice_date || inv.invoice_date > entry.last_invoice_date)) {
          entry.last_invoice_date = inv.invoice_date;
        }
        byVendor.set(key, entry);
      }
      send(res, 200, [...byVendor.values()].sort((a, b) => b.open_balance_inr - a.open_balance_inr));
      return;
    }
    if (path === "/api/vendors" && method === "POST") {
      const body = await readBody(req);
      const vendor = {
        id: `v${vendorSeq++}`,
        name: String(body.name ?? ""),
        gstin: String(body.gstin ?? ""),
        state: String(body.state ?? ""),
        payment_terms: String(body.payment_terms ?? ""),
        email: String(body.email ?? ""),
      };
      vendors.push(vendor);
      send(res, 201, vendor);
      return;
    }
    const vendorMatch = /^\/api\/vendors\/([^/]+)$/.exec(path);
    if (vendorMatch) {
      const id = vendorMatch[1];
      const idx = vendors.findIndex((v) => v.id === id);
      if (method === "PUT") {
        if (idx === -1) {
          send(res, 404, { detail: "Vendor not found." });
          return;
        }
        const body = await readBody(req);
        vendors[idx] = { ...vendors[idx], ...body, id };
        send(res, 200, vendors[idx]);
        return;
      }
      if (method === "DELETE") {
        if (idx === -1) {
          send(res, 404, { detail: "Vendor not found." });
          return;
        }
        vendors.splice(idx, 1);
        send(res, 200, { ok: true });
        return;
      }
    }

    if (path === "/api/invoices/upload" && method === "POST") {
      await readBody(req); // consume the multipart body; content is not parsed
      const id = `inv-${invoiceSeq++}`;
      const today = new Date().toISOString().slice(0, 10);
      const invoice = {
        id,
        vendor_id: "",
        // No vendor until extraction runs — mirrors the real backend, so
        // this upload must not create a phantom vendor-balance row.
        vendor_name: "",
        invoice_number: `INV-${String(invoiceSeq).padStart(4, "0")}`,
        invoice_date: today,
        due_date: null,
        currency: "INR",
        status: "received",
        subtotal: 0,
        tax_total: 0,
        total: 0,
        document_hash: null,
        lines: [],
        match: null,
        exceptions: [],
        extraction_error: null,
        extraction_error_kind: null,
      };
      invoices.push(invoice);
      send(res, 201, invoice);
      return;
    }
    if (path === "/api/invoices" && method === "GET") {
      send(res, 200, invoices);
      return;
    }
    const invoiceMatch = /^\/api\/invoices\/([^/]+)$/.exec(path);
    if (invoiceMatch && method === "GET") {
      const inv = invoices.find((i) => i.id === invoiceMatch[1]);
      if (!inv) {
        send(res, 404, { detail: "Invoice not found." });
        return;
      }
      send(res, 200, inv);
      return;
    }
    const retryMatch = /^\/api\/invoices\/([^/]+)\/retry-extraction$/.exec(path);
    if (retryMatch && method === "POST") {
      const inv = invoices.find((i) => i.id === retryMatch[1]);
      if (!inv) {
        send(res, 404, { detail: "Invoice not found." });
        return;
      }
      if (inv.status !== "on_hold" && inv.status !== "flagged") {
        send(res, 409, { detail: "Only on-hold or flagged invoices can be retried." });
        return;
      }
      inv.status = "received";
      inv.extraction_error = null;
      inv.extraction_error_kind = null;
      // Simulate the background re-run finishing: a successful
      // re-extraction that still needs review (no PO on file).
      setTimeout(() => {
        inv.status = "flagged";
        inv.vendor_id = "v-seed";
        inv.vendor_name = "Seeded Vendor";
        inv.subtotal = 10462.43;
        inv.tax_total = 1883.24;
        inv.total = 12345.67;
        inv.lines = [
          {
            description: "Seeded test line",
            hsn_code: "9999",
            qty: 1,
            unit_price: 10462.43,
            tax_rate_pct: 18,
            line_total: 10462.43,
          },
        ];
        inv.exceptions = [
          { code: "MISSING_PO", message: "No matching purchase order found.", severity: "medium" },
        ];
      }, 1200);
      send(res, 202, inv);
      return;
    }
    if (path === "/api/_test/seed-parked-invoice" && method === "POST") {
      // Test seam for the retry flow: an on_hold invoice carrying a
      // REAL extraction failure (kind from the body, default
      // "overloaded"), exactly as the backend reports one.
      const body = await readBody(req);
      const kind = String(body.kind ?? "overloaded");
      const messages = {
        overloaded:
          "Gemini overloaded (HTTP 503) — the model was temporarily unavailable. Retry the invoice.",
        quota: "Gemini quota exhausted (HTTP 429) — daily limit reached. Retry later.",
        no_key: "No Gemini API key is configured on this backend.",
        failed: "Extraction failed — the extractor returned an error.",
      };
      const id = `inv-${invoiceSeq++}`;
      const invoice = {
        id,
        vendor_id: "",
        vendor_name: "",
        invoice_number: "PARKED-0001",
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: null,
        currency: "INR",
        status: "on_hold",
        subtotal: 0,
        tax_total: 0,
        total: 0,
        document_hash: `seed-${id}`,
        lines: [],
        match: null,
        exceptions: [],
        extraction_error: messages[kind] ?? messages.failed,
        extraction_error_kind: kind,
      };
      invoices.push(invoice);
      send(res, 201, invoice);
      return;
    }
    if (path === "/api/metrics" && method === "GET") {
      send(res, 200, {
        total_invoices: invoices.length,
        by_status: {},
        exceptions_open: 0,
        money_in_exceptions_inr: 0,
        auto_approved: 0,
        overdue_count: 0,
        overdue_total_inr: 0,
        due_soon_count: 0,
        due_soon_total_inr: 0,
        aging_buckets: {},
      });
      return;
    }
    if (path === "/api/payments" && method === "GET") {
      send(res, 200, []);
      return;
    }
    if (path === "/api/forecast" && method === "GET") {
      send(res, 200, {
        weeks: 4,
        start: new Date().toISOString().slice(0, 10),
        weekly_outflows: [],
        total_projected_inr: 0,
      });
      return;
    }
    if (path === "/api/queue/exceptions" && method === "GET") {
      send(res, 200, []);
      return;
    }

    send(res, 404, { detail: "Not found." });
    return;
  }

  send(res, 404, { detail: "Not found." });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`stub api listening on http://localhost:${PORT} (access TTL ${ACCESS_TTL_SECONDS}s)`);
});
