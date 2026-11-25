# Progress

## Phase 1 — Foundation ✅

**Acceptance:** user can sign up, log in, and see their forwarding address on Settings.
Covered by `tests/e2e/auth.spec.ts` (mobile + desktop Chrome): sign up via magic link →
lands on Settings → address matches `u-xxxxxxxx@in.keeptrack.app` → log out → log in again →
same address.

### Built

| Item                                                                     | Where                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Next.js 16.4 (App Router, Turbopack, Cache Components) + TS              | `app/`, `next.config.ts`                                                      |
| Tailwind v4 + shadcn/ui (base-nova)                                      | `app/globals.css`, `components/ui/`                                           |
| ESLint (next + prettier), Prettier (+ tailwind plugin)                   | `eslint.config.mjs`, `.prettierrc.json`                                       |
| Vitest (unit), Playwright (e2e)                                          | `vitest.config.mts`, `playwright.config.ts`, `tests/`                         |
| Drizzle schema for **all** Section 5 tables + Auth.js tables             | `lib/db/schema.ts`, migration `drizzle/0000_init.sql`                         |
| Auth.js v5: magic link (Resend) + Google (`openid email profile`)        | `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`                          |
| Forwarding address created on first login (+ idempotent backstop)        | `lib/forwarding.ts`, `lib/users.ts` (`events.createUser`, Dashboard/Settings) |
| Browser timezone detected on first login                                 | `components/timezone-sync.tsx`, `app/actions/user.ts`                         |
| Mobile-first layout: bottom tab bar on phones, top nav from `md`         | `app/(app)/layout.tsx`, `components/app-nav.tsx`                              |
| Pages: landing, login, check-email, auth error, dashboard, add, settings | `app/(marketing)`, `app/login`, `app/(app)`                                   |
| Env validation with zod (lazy, never prints values)                      | `lib/env.ts`, `.env.example`                                                  |
| Optimistic route guard + real DAL check                                  | `proxy.ts`, `lib/session.ts`                                                  |
| Local Postgres                                                           | `docker-compose.yml` (port 5434)                                              |

### Edge cases handled in this phase

- **EC-ACC-01** Expired/used magic link → `/login/error` with "Send new link" (e2e tested).
- **EC-ACC-02** Google + magic link with the same email → linked (`allowDangerousEmailAccountLinking`; Google verifies email).
- **EC-ACC-04 (partial)** Local parts are globally unique forever, so they are never reassigned.
- **EC-ACC-08** Auth logger prints error names/codes only; env errors never echo values.
- **EC-SEC-03** All user data goes through `getCurrentUser()`; `user_id` comes from the session only.
- Open-redirect protection on `callbackUrl` (`lib/safe-redirect.ts`, unit tested).

### Decisions and deviations (please review)

- **Extra columns beyond Section 5**, all referenced elsewhere in the plan:
  `users.timezone_detected` (F1 "detect timezone on first login" needs a flag),
  `users.pending_gmail_code` + `_expires_at` (Section 6.2),
  `purchases.user_edited_fields` (Section 6.4 / EC-DATE-10),
  Auth.js adapter fields on `users` (`email_verified`, `image`).
- **Purchase dedupe index** is `(user_id, coalesce(store_id, lower(store_name)), external_order_id)`
  where `external_order_id is not null and deleted_at is null`, which matches the 6.4 key
  ("store_id or normalized store_name"). Soft-deleted purchases don't block re-import.
- **`audit_log.user_id`** is `ON DELETE SET NULL`, so account deletion leaves no rows tied to the user (Phase 6 acceptance).
- **Enumerations** are `text` + `CHECK` constraints (cheap to extend) rather than Postgres enums.
- **Resend** chosen for outbound email (the plan allows Postmark or Resend).
- **Database sessions** (not JWT), so sessions can be revoked on account deletion.
- **npm** instead of pnpm (pnpm isn't installed here). `pnpm eval:parser` in Section 13 becomes `npm run eval:parser` in Phase 3.
- Kept the scaffold's `cacheComponents`; session reads sit inside `<Suspense>` as Next 16 requires.
- Without `RESEND_API_KEY` in development, magic links are printed to the server console.
  With `E2E_MAGIC_LINK_DIR` set, they're written to files for Playwright. Both are refused when `NODE_ENV=production`.
- The magic-link action uses `signIn(..., { redirect: false })` and then redirects to `/login/check-email`.
  Auth.js's default redirect to `/api/auth/verify-request` isn't followed by the client router after a server action.

### Known issues / notes

- E2E runs against `next dev` (production mode refuses the test-only magic-link sink), so the suite is serial with longer timeouts. The first run is slow while routes compile.
- Google sign-in is wired but untested end-to-end (needs real OAuth credentials). It's hidden unless both `AUTH_GOOGLE_*` vars are set.
- The `onboarding` route is guarded in `proxy.ts` but not built yet (planned for Phase 3 with the Gmail setup guide).

### TODOs carried forward

- `TODO EC-SEC-04` Rate-limit magic-link requests (`app/actions/auth.ts`) → Phase 6.
- **EC-DATE-08:** a timezone change from Settings must recompute unsent reminders → Phase 5 (Settings editing isn't built yet).
- **EC-ACC-06:** regenerate forwarding address with a 7-day grace period → with the Settings edit work.

## Phase 2 — Manual purchases + deadlines ✅

**Acceptance:** all deadline tests pass; a manual purchase shows the correct countdown.

- Unit: `tests/unit/deadlines.test.ts` (40 cases) plus date/countdown, status, and input tests.
  123 tests pass, including under server timezones UTC, New York, Kiritimati (UTC+14) and Pago Pago (UTC−11).
- E2E: `tests/e2e/purchases.spec.ts`. Add a purchase delivered yesterday with a 10-day window →
  "Return: 9 days left" on the detail page and the dashboard → mark Returned → moves to History.

### Built

| Item                                                                                     | Where                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Calendar-date helpers (timezone/DST safe)                                                | `lib/dates.ts`                                                                                   |
| `computeDeadlines()` (Section 8): window priority, base date, per-item, warranty, expiry | `lib/deadlines/compute.ts`                                                                       |
| Countdown chips: red ≤3, amber ≤7, `~` for estimates                                     | `lib/deadlines/countdown.ts`, `components/purchases/countdown-chip.tsx`                          |
| Store seed (top 10), idempotent                                                          | `lib/db/seed/stores.ts`, `scripts/seed-stores.ts` (`npm run db:seed`)                            |
| Manual add / edit / soft delete, multi-item, item-level status                           | `components/purchases/purchase-form.tsx`, `lib/purchases/service.ts`, `app/actions/purchases.ts` |
| Input validation (shared by client and server)                                           | `lib/purchases/input.ts`                                                                         |
| Dashboard tabs: Returns closing soon / Under warranty / Needs review / History           | `app/(app)/dashboard/page.tsx`, `lib/purchases/buckets.ts`                                       |
| Purchase detail + edit pages                                                             | `app/(app)/purchases/[id]/`                                                                      |
| Status actions: Returned / Keeping it / Order cancelled / Mark active again              | `components/purchases/status-actions.tsx`, `lib/purchases/status.ts`                             |

### Edge cases handled

- **EC-DATE-01** Unknown or expected delivery → estimated deadline (`~`); recomputed when the delivery date is set.
- **EC-DATE-02** Deadline already passed → "Closed"; status `expired` only if no warranty remains.
- **EC-DATE-04** Unknown window → `needs_review`, Needs review tab, "Set return window" prompt.
- **EC-DATE-05** Final sale / 0-day window → no return deadline, "Final sale" badge.
- **EC-DATE-06/07** Month-end and leap-day arithmetic (unit tested).
- **EC-DATE-10** `user_edited_fields` recorded on manual create/edit, so Phase 3 email merges won't overwrite them.
- **EC-DATE-11** Partial returns: item-level status; the purchase stays active until all items are resolved.
- **EC-DATE-12** Extended warranty: the later end date wins.
- **EC-ING-02 (manual)** The same order number from the same store can't be added twice.
- **EC-ING-04** Per-item return windows by category; the earliest one is shown.
- **EC-ING-22** Dates are calendar dates; deadlines end at 23:59:59.999 in the user's timezone.
- **EC-ING-25** `digital` category is non-returnable by default; warranty is still tracked.
- **EC-DATE-08/09** The deadline instant is computed from the user's timezone and DST (unit tested). Reminder recompute is Phase 5.

### Decisions (please review)

- **Store policies verified 2026-11-25 from each retailer's official page** (quotes and URLs are in
  `lib/db/seed/stores.ts`; `tests/unit/store-seeds.test.ts` enforces "verified with a source, or null"):

  | Store         | Default             | Counts from                              | Category rules                                            |
  | ------------- | ------------------- | ---------------------------------------- | --------------------------------------------------------- |
  | Flipkart      | none (per category) | delivery                                 | fashion 10, home 7, electronics 7, appliance 7, grocery 2 |
  | Nykaa         | 15                  | delivery                                 | appliance: non-returnable                                 |
  | IKEA (India)  | 365                 | order (start not stated; earlier option) | grocery: non-returnable                                   |
  | Apple (US)    | 14                  | delivery                                 | none                                                      |
  | Best Buy (US) | 15                  | delivery                                 | electronics 14, digital: non-returnable                   |

  Where a store's range spans one of our categories, the **shorter** window is stored (remind early).
  Several Flipkart windows are replacement-only; we still track the date.
  **Not verified (left `null`, users are asked):** Amazon.in and Amazon.com (HTTP 503), Myntra (timeout),
  AJIO and Croma (HTTP 403 to automated readers). Re-check them by hand, or retry later.
  Best Buy paid-member windows (60 days) and holiday extensions aren't modelled; users can enter their own window.
  Sender domains are best-known values; confirm them against real emails in Phase 3.

- **The return-window hint is category-aware** (`lib/purchases/policy-hint.ts`): it shows the policy for the
  chosen categories, says when a category is non-returnable or not covered, and fills the placeholder.
- **Unknown store → window counts from the order date, marked estimated.** This follows the plan's
  "pick the earlier date when unsure" rule. If the delivery date is the same as the order date (bought in person),
  the deadline is exact.
- **Warranty starts at actual delivery**, or the order date if delivery is only expected.
- **A future delivery date counts as "expected"** (`delivery_date_estimated = true`).
- **New column** `purchases.return_window_source` (`user | email | category | store`), so a user-set window
  (priority 1) is distinguishable from a policy-derived one. Migration `drizzle/0001_*`.
  `purchase_items.category` now has a CHECK constraint.
- **Server actions instead of REST routes** for purchase mutations (the plan allows this). The `GET /api/purchases`
  JSON endpoint will be added in Phase 5 for the offline dashboard cache.
- **"Mark as active again"** resets every item to active (partial-return detail is lost on reopen).
- **E2E has its own build folder** (`NEXT_DIST_DIR=.next-e2e`), so tests can run while `npm run dev` is up.

### TODOs carried forward

- `TODO EC-PUSH-06` Cancel unsent return reminders on status change (`lib/purchases/service.ts`) → Phase 5.
- Daily cleanup cron to flip `active → expired` (Section 8). The dashboard already buckets by today's date,
  so it's correct without the cron → Phase 3 (`/api/cron/cleanup`).
- **EC-ING-24** pre-orders: create reminders only once delivery is known or estimated → Phase 5.
- **Re-compute existing purchases when store policies change.** Saved deadlines currently update only on
  edit or status change → run it from the Phase 3 daily cleanup job (needed before launch, when policies are re-verified).

## Phase 3 — Inbound email pipeline ✅ (verified; store templates wait for real sample emails)

**Mode:** LLM fallback fully built but **off until `ANTHROPIC_API_KEY` is set** (plan B). Emails that no
store template can read become a pre-filled "Needs review" draft via the generic extractor. Adding the
key and restarting the server switches the LLM on with no code change.

**Verified 2026-11-25:** 200 unit tests, lint, typecheck, production build, and the full Playwright suite
(auth, purchases, Postmark inbound, Resend inbound via a local Receiving-API mock, dev paste tool).

### Built

| Item                                                                                                                                                                                                    | Where                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Webhook `POST /api/inbound/email`: Resend (Svix signature, 5 min replay window) or Postmark (Basic auth), 15 MB cap, idempotency, recipient resolution with 7-day grace, 50/h rate limit, never bounces | `app/api/inbound/email/route.ts`, `lib/ingest/receive.ts`, `lib/ingest/resend.ts`, `lib/ingest/postmark.ts` |
| Resend content fetch during processing (Receiving API + PDF attachments), retryable vs. permanent failures                                                                                              | `lib/ingest/resend.ts`, `lib/ingest/process.ts`                                                             |
| Dev-only "Paste an email" tool (`/dev/inbound`, linked from Settings) feeding the same pipeline                                                                                                         | `app/(app)/dev/inbound`, `app/actions/dev-inbound.ts`                                                       |
| AES-256-GCM raw storage, nulled after processing, hard 24 h purge                                                                                                                                       | `lib/crypto.ts`, `lib/ingest/process.ts`, `lib/cleanup.ts`                                                  |
| Forward unwrapping (Gmail, Apple Mail, Outlook, auto-forward), HTML → text, 30k cap, store matching                                                                                                     | `lib/ingest/unwrap.ts`, `html-to-text.ts`, `store-match.ts`                                                 |
| PDF invoice text (EC-ING-08), image-only detection (EC-ING-09)                                                                                                                                          | `lib/ingest/pdf.ts`, `html-to-text.ts`                                                                      |
| Gmail verification code → shown live on `/onboarding` (3 s polling); auto-forward marks Gmail verified                                                                                                  | `lib/ingest/gmail-verification.ts`, `app/(app)/onboarding`, `app/api/me/gmail-code`                         |
| Template registry (empty until real emails), rule classifier, generic extractor                                                                                                                         | `lib/ingest/templates/index.ts`, `classify.ts`, `generic-extract.ts`                                        |
| LLM fallback: redaction, `<email>` wrapping, structured output + zod re-validation, 20 s timeout, 1 retry, daily caps                                                                                   | `lib/ingest/redact.ts`, `llm.ts`, `process.ts`                                                              |
| Merge rules (6.4) incl. partial cancel/return, dedupe without order id, user edits protected                                                                                                            | `lib/ingest/merge.ts`, `upsert.ts`                                                                          |
| Review screen: reasons + "Looks right" + Edit; "What we stored from your emails"; "Emails we couldn't read"                                                                                             | `components/purchases/review-callout.tsx`, `email-provenance.tsx`, dashboard                                |
| Cron: `/api/cron/retry` (5 min, backoff 5/30/120, stuck > 10 min reset), `/api/cron/cleanup` (daily purge + recompute all open purchases)                                                               | `app/api/cron/*`, `vercel.json`                                                                             |

### Decisions / deviations

- **Inbound provider: Resend instead of Postmark** (approved 2026-11-25). Resend gives every account a
  catch-all `<id>.resend.app` receiving domain, so no domain purchase is needed and forwarding addresses
  keep their `u-xxxxxxxx@` form. Resend webhooks carry metadata only; the encrypted row stores a pointer
  (`{provider:"resend", emailId}`) and the content is fetched from the Receiving API at processing time,
  in memory only. Signature verification is implemented directly (Svix scheme), no new dependency.
  Postmark support stays: the same URL accepts either, chosen by the request (`svix-id` header vs Basic auth).
- **Privacy note:** Resend itself keeps received emails for its retention period (30 days on Free).
  Our copy still follows the 24 h rule. `TODO EC-ACC-07`: delete the provider copy after processing if
  Resend adds a delete endpoint for received emails.
- `RESEND_API_KEY` must be a **full access** key to read received emails (a sending-only key gets 401;
  those emails stay retryable until the key is fixed).

- **No store templates yet.** Section 7 requires 3+ real anonymized emails per store; none were provided.
  The registry is ready; the e2e tests use clearly-labelled synthetic payloads only.
- **Haiku 5.5 rejects `temperature`**, so determinism comes from structured outputs + `effort: "low"`
  instead of the plan's "temperature 0".
- New columns: `inbound_emails.llm_parsed_at` (cost caps), `inbound_emails.review_reason`,
  `purchases.review_reasons` (migration `0002`).
- The daily cleanup job now recomputes every open purchase, which also resolves the Phase 2 TODO about
  store-policy changes.

### Still to do before Phase 3 is accepted

- Live mail: set `INBOUND_DOMAIN` to your `<id>.resend.app` address, add an `email.received` webhook
  pointing at a public URL (tunnel or deploy) + `/api/inbound/email`, and put its secret in `RESEND_WEBHOOK_SECRET`.
- Real store templates once sample emails arrive.
- `TODO` notifications (EC-ING-10/14, LLM cap) land with Phase 5 push/email.

## Next: Phase 4 — Receipts & documents
