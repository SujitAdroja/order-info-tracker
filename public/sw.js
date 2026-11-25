/* KeepTrack service worker (Section 3: hand-written, minimal).
 *
 * - Push: shows reminders; "Returned" / "Keeping it" buttons update the
 *   purchase without opening the app (Section 9).
 * - Offline (EC-PWA-01): app pages are never cached (they hold personal
 *   data). When a page can't load, the worker renders a plain read-only page
 *   from the last dashboard JSON saved from /api/purchases. It needs no
 *   JavaScript, so it works even if the app's code was never cached.
 * - Updates (EC-PWA-02): a new version waits until the user taps "Reload".
 *
 * The version comes from the registration URL (`/sw.js?v=…`); changing it
 * installs a new worker and drops old static caches.
 */
const params = new URL(self.location.href).searchParams;
const VERSION = params.get("v") || "dev";
const DEV = params.get("dev") === "1";
const STATIC_CACHE = `keeptrack-static-${VERSION}`;
const DATA_CACHE = "keeptrack-data"; // survives updates; cleared on logout
const PRECACHE = ["/icons/icon-192.png", "/icons/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
  // No skipWaiting here: the page asks the user first (EC-PWA-02).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) => k.startsWith("keeptrack-static-") && k !== STATIC_CACHE,
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "CLEAR_DATA") event.waitUntil(caches.delete(DATA_CACHE));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/purchases") {
    event.respondWith(dashboardData(req));
    return;
  }
  // Immutable build assets. Skipped in dev, where chunk URLs are reused.
  if (
    !DEV &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/"))
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => offlinePage()));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(STATIC_CACHE)).put(req, res.clone());
  return res;
}

/** Network first; keep the last good copy for offline use. */
async function dashboardData(req) {
  try {
    const res = await fetch(req);
    if (res.ok)
      (await caches.open(DATA_CACHE)).put("/api/purchases", res.clone());
    if (res.status === 401) await caches.delete(DATA_CACHE); // signed out elsewhere
    return res;
  } catch {
    const cached = await caches.match("/api/purchases", {
      cacheName: DATA_CACHE,
    });
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("x-keeptrack-offline", "1");
      return new Response(cached.body, { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

// ---------------------------------------------------------------------------
// Offline page (rendered here from the saved JSON; no app code needed)
// ---------------------------------------------------------------------------

async function offlinePage() {
  let data = null;
  try {
    const cached = await caches.match("/api/purchases", {
      cacheName: DATA_CACHE,
    });
    if (cached) data = await cached.json();
  } catch {
    data = null;
  }
  return new Response(renderOffline(data), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'",
    },
  });
}

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function todayIn(tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function daysBetween(to, from) {
  const d = (s) =>
    Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(to) - d(from)) / 86400000);
}

function fmtDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function money(amount, currency) {
  if (amount == null || amount === "") return "";
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency || ""} ${n}`;
  }
}

/** Mirrors lib/deadlines/countdown.ts for the chip text and colour. */
function chip(prefix, deadline, today, estimated) {
  const days = daysBetween(deadline, today);
  const label =
    days === 0
      ? "Last day today"
      : days === 1
        ? "1 day left"
        : days > 60
          ? `Until ${fmtDate(deadline)}`
          : `${days} days left`;
  const tone = days <= 3 ? "danger" : days <= 7 ? "warning" : "neutral";
  return `<span class="chip ${tone}">${prefix}: ${estimated ? "~" : ""}${esc(label)}</span>`;
}

/** Mirrors lib/purchases/buckets.ts (read-only lists). */
function renderOffline(data) {
  const sections = [];
  if (data && Array.isArray(data.purchases)) {
    const today = todayIn(data.timezone);
    const open = (p) => p.status === "active" || p.status === "expired";
    const returns = data.purchases
      .filter((p) => open(p) && p.returnDeadline && p.returnDeadline >= today)
      .sort((a, b) => a.returnDeadline.localeCompare(b.returnDeadline));
    const warranty = data.purchases
      .filter(
        (p) =>
          (open(p) || p.status === "kept") &&
          p.latestWarrantyEnd &&
          p.latestWarrantyEnd >= today,
      )
      .sort((a, b) => a.latestWarrantyEnd.localeCompare(b.latestWarrantyEnd));
    const review = data.purchases.filter(
      (p) =>
        p.needsReview && p.status !== "returned" && p.status !== "cancelled",
    );
    const card = (p, chipHtml) => {
      const meta = [
        esc(p.storeName),
        esc(money(p.totalAmount, p.currency)),
        `Ordered ${esc(fmtDate(p.orderDate))}`,
      ].filter(Boolean);
      return `<li data-testid="offline-purchase"><strong>${esc(p.title)}</strong><span class="muted">${meta.join(" · ")}</span>${chipHtml}</li>`;
    };
    const list = (title, items, chipFor) =>
      `<h2>${title}</h2><ul>${items.map((p) => card(p, chipFor(p))).join("")}</ul>`;
    if (returns.length) {
      sections.push(
        list("Returns closing soon", returns, (p) =>
          chip("Return", p.returnDeadline, today, p.returnDeadlineEstimated),
        ),
      );
    }
    if (warranty.length) {
      sections.push(
        list("Under warranty", warranty, (p) =>
          chip("Warranty", p.latestWarrantyEnd, today, false),
        ),
      );
    }
    if (review.length) sections.push(list("Needs review", review, () => ""));
    if (!sections.length) {
      sections.push(`<p class="muted">Nothing open right now.</p>`);
    }
  } else {
    sections.push(
      `<p class="muted">No saved data on this device yet. Open KeepTrack once while online and it will be available offline.</p>`,
    );
  }
  const saved =
    data && data.savedAt
      ? `Last updated ${esc(new Date(data.savedAt).toLocaleString())}. `
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · KeepTrack</title><style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif;--muted:#666;--line:#ddd}
@media (prefers-color-scheme:dark){:root{--muted:#aaa;--line:#333}}
body{margin:0 auto;max-width:48rem;padding:1.5rem 1.25rem;line-height:1.45}
.banner{background:#fef3c7;color:#451a03;border-radius:.6rem;padding:.75rem 1rem}
.banner p{margin:.2rem 0}.banner a{color:inherit}
h2{font-size:1rem;margin:1.5rem 0 .5rem}
ul{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
li{border:1px solid var(--line);border-radius:.6rem;padding:.75rem;display:grid;gap:.25rem}
.muted{color:var(--muted);font-size:.875rem}
.chip{justify-self:start;font-size:.75rem;font-weight:500;border-radius:999px;padding:.15rem .6rem;background:#eee;color:#111}
.chip.danger{background:#fee2e2;color:#991b1b}.chip.warning{background:#fef3c7;color:#78350f}
</style></head><body>
<div class="banner" role="status"><p><strong>Offline — showing saved data</strong></p>
<p>${saved}Changes are paused until you're back online.</p>
<p><a href="">Try again</a></p></div>
${sections.join("\n")}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "KeepTrack", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "KeepTrack";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: safePath(data.url), purchaseId: data.purchaseId || null },
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const { url, purchaseId } = n.data || {};
  n.close();

  if ((event.action === "returned" || event.action === "kept") && purchaseId) {
    event.waitUntil(
      (async () => {
        try {
          const res = await fetch("/api/notifications/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ purchaseId, action: event.action }),
          });
          if (res.ok) {
            await self.registration.showNotification(
              event.action === "returned"
                ? "Marked as returned"
                : "Marked as kept",
              {
                body: "We'll stop return reminders for it.",
                icon: "/icons/icon-192.png",
                badge: "/icons/badge-96.png",
                tag: n.tag || undefined,
              },
            );
            return;
          }
        } catch {
          // offline or signed out: fall through and open the purchase
        }
        await openPath(url);
      })(),
    );
    return;
  }
  event.waitUntil(openPath(url));
});

/** Focus an open KeepTrack window (navigating it) or open a new one. */
async function openPath(path) {
  const target = new URL(safePath(path), self.location.origin).href;
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (
      new URL(client.url).origin === self.location.origin &&
      "focus" in client
    ) {
      await client.focus();
      if ("navigate" in client) await client.navigate(target).catch(() => {});
      return;
    }
  }
  await self.clients.openWindow(target);
}

/** Only same-origin relative paths from push payloads (no open redirects). */
function safePath(path) {
  return typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//")
    ? path
    : "/dashboard";
}
