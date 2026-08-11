# Cloudflare Guestbook Starter — Implementation Plan

## Context

This repo (`andornaut/cloudflare-starter`) is empty except for a LICENSE (MIT). The goal is a starter/scaffold project: a "hello world" home page with a guestbook. Visitors submit a message + email; entries are stored in a database and rendered back safely (no XSS). Everything runs on Cloudflare's edge, using only free-tier services. The plan must be complete enough for an agent to execute end-to-end.

Two views over the same table:

| View   | Route    | Who                     | Can               | Sees                                          | Extent                   |
| ------ | -------- | ----------------------- | ----------------- | --------------------------------------------- | ------------------------ |
| Public | `/`      | anyone                  | add only          | message + redacted email (`a***@example.com`) | newest 20, no pagination |
| Admin  | `/admin` | the one `admin` account | add, edit, delete | message + full email                          | every entry, paginated   |

The admin view is protected by a shared secret held in a Worker secret. The secret is never in the repo, never in the client bundle, and never sent to the browser.

## Stack decision (Go is not the right fit)

- **Backend language: TypeScript, not Go.** Cloudflare Workers natively run JavaScript/TypeScript. Go only runs via TinyGo compiled to WASM using community-maintained bindings (`syumai/workers`); standard Go binaries exceed the free plan's 3 MB script-size limit, TinyGo's D1 support is unofficial, and debugging/DX is poor. TypeScript gets first-class D1 bindings, official tooling, and the fastest cold starts.
- **Framework: SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`.** Since the UI is Svelte anyway, SvelteKit collapses frontend + backend into a single Worker: server-rendered pages at the edge, form actions for the API, static assets served free. No separate API service needed.
- **Database: Cloudflare D1** (SQLite at the edge), bound to the Worker as `platform.env.DB`.
- **Tooling: Wrangler CLI** for local dev (Miniflare emulation), D1 migrations, and deploys. npm scripts are the task runner: `package.json` is already the script table in a Node project, and `wrangler`/`svelte-check`/`vitest` resolve from `node_modules/.bin` inside a script without `npx`.

## Free-tier fit (no paid services)

| Service                        | Free limit                                          | Guestbook usage            |
| ------------------------------ | --------------------------------------------------- | -------------------------- |
| Workers                        | 100k requests/day, 10 ms CPU/request                | SSR + form posts — trivial |
| D1                             | 5 GB storage, 5M row reads/day, 100k row writes/day | One tiny table             |
| Static assets on Workers       | Free, unmetered                                     | JS/CSS bundles             |
| `<name>.workers.dev` subdomain | Free                                                | No custom domain required  |

Admin paging costs more row reads than the public page: `COUNT(*)` plus an `OFFSET` scan both read rows proportional to table size. At guestbook scale that is nowhere near the 5M/day free allowance, and only an authenticated admin can trigger it. A table large enough for it to matter wants keyset pagination (`WHERE (created_at, id) < (?, ?)`) instead, which is the noted extension.

## Architecture

Single Cloudflare Worker (the SvelteKit app) serving server-rendered pages and form actions, backed by a D1 database. Static assets are served from the Worker's asset store. The Worker is named `cloudflare-starter`, after the repo, so the deployed URL and the checkout agree.

Both views are routes in the same Worker. `/admin/*` is gated in `src/hooks.server.ts`, so a new admin route is protected by existing on the path rather than by remembering to add a check to its `load`.

## Repository conventions

Carried over from the sibling repos (`faramir`, `filectrl`, `ansible-ctrl`, `ai-maintainer`) so this starter behaves like the rest of the account:

- **npm scripts as the front door.** No Makefile: in the sibling repos make fronts a toolchain with no built-in script table (Go, Rust, Ansible), whereas here it would only restate `package.json`. Scripts: `dev`, `build`, `preview`, `check`, `lint`, `format`, `test`, `migrate`, `deploy`, `clean`. `npm run` lists the names; the README's Developing section supplies the one-line description of each.
- **CI under `.github/workflows/`**, pinned action versions (e.g. `actions/checkout@v7.0.1`), `permissions: contents: read`, a `concurrency` group with `cancel-in-progress: true`, and `workflow_dispatch` on every workflow.
  - `test.yml` — on push to `main` and pull requests: install, `svelte-check`, lint, Vitest, build. The gate is the whole repo, not the lines a change touched.
  - `ai-attributions.yml` — the account-standard scan (`andornaut/ai-attributions@v1`), on push to every branch, pull requests, and dispatch, matching the copy in every sibling repo.
- **`.github/dependabot.yml`** — weekly `npm` and `github-actions` updates with `cooldown: default-days: 7`, as in filectrl.
- **`.markdownlint.json`** — disable `line-length` and `no-inline-html`, as in filectrl.
- **`.nvmrc`** pinning Node 24 (current LTS), so nvm/fnm — and ai-maintainer's toolchain detection — resolve the right runtime.
- **Fail loudly.** Invalid input returns a 400 with field errors; a missing D1 binding renders the page with an explicit notice rather than a blank list; nothing is silently ignored.

## Implementation steps

### 1. Scaffold SvelteKit

- `npx sv create` (minimal template, TypeScript) or hand-author the equivalent files.
- Install `@sveltejs/adapter-cloudflare`, set it in `svelte.config.js`.
- Add `wrangler`, `@cloudflare/workers-types`, `vitest`, `prettier` + `prettier-plugin-svelte`, and `eslint` + `eslint-plugin-svelte` as dev dependencies.
- Add the `package.json` scripts, `.nvmrc`, `.gitignore`, `.dev.vars.example`, `.markdownlint.json`, and the `.github/` files from [Repository conventions](#repository-conventions).

### 2. Site metadata: `src/lib/config.ts`

One committed module is the single source for every non-secret value the app renders or links to. Nothing that appears in a page or a query hardcodes these anywhere else.

```ts
export const site = {
	name: 'cloudflare-starter',
	title: 'Hello, world - Cloudflare edge starter',
	description: 'A SvelteKit + Cloudflare Workers + D1 starter with a guestbook.',
	domain: '', // canonical host, e.g. 'guestbook.example.com'; empty = derive from the request
	entryLimit: 20, // rows the public page lists, and the number in its heading
	adminPageSize: 50, // rows per page in the admin table
	sessionTtlHours: 12 // admin session lifetime
} as const;
```

Consumers: the `<svelte:head>` title/description and canonical link in `src/routes/+layout.svelte`, the "Latest {entryLimit} guestbook entries" heading and the public query's `LIMIT`, the admin page size and its offset arithmetic, and the login action's cookie `maxAge`. Changing a limit changes the query and the text together, because they read the same field.

The boundary, so "one place" stays true:

| Kind                                                                                          | Where                       | Why not in `config.ts`                                                |
| --------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Site metadata (title, description, domain, limits, page size, TTL)                            | `src/lib/config.ts`         | -                                                                     |
| Cloudflare platform config (worker name, compatibility date, D1 binding, custom-domain route) | `wrangler.jsonc`            | Wrangler reads it before the app builds and cannot import TypeScript. |
| Secrets (`ADMIN_SECRET`)                                                                      | Worker secret / `.dev.vars` | `config.ts` is committed.                                             |

`domain` is metadata for canonical and Open Graph tags, not routing: the deployed origin is whatever Cloudflare serves, and the app reads `url.origin` for links when `domain` is empty. With a custom domain out of scope, the field ships empty and the route entry in `wrangler.jsonc` is the only thing to add later, which the README says.

### 3. Cloudflare config — `wrangler.jsonc`

- Worker name `cloudflare-starter`, compatibility date, the adapter's output as the main entry, an assets binding, and a `d1_databases` binding named `DB` for database `guestbook-db` (placeholder `database_id` until `wrangler d1 create` mints the real one).
- The adapter's dev-mode platform proxy (`getPlatformProxy`) makes `platform.env.DB` work in `vite dev` against a local SQLite file.
- `ADMIN_SECRET` is a Worker secret, set with `npx wrangler secret put ADMIN_SECRET`, not a `vars` entry: `vars` values live in `wrangler.jsonc`, which is committed. Rotating it is `wrangler secret put` again, which takes effect without a code change; a redeploy is harmless but not required.
- Locally the same value comes from `.dev.vars`, which `.gitignore` lists alongside `.svelte-kit/`, `node_modules/`, and the local D1 state. The README tells the user to write their own value there; the repo ships `.dev.vars.example` with a placeholder.

### 4. Database migration — `migrations/0001_create_guestbook.sql`

- Create `guestbook_entries`: `id` (integer primary key), `email` (text, not null), `message` (text, not null), `created_at` (text, not null, default `CURRENT_TIMESTAMP`).
- `CURRENT_TIMESTAMP` is second-granular, so same-second inserts tie; the list query breaks the tie on `id`, which only advances.
- An admin edit rewrites `email` and `message` only. `id` and `created_at` are left alone, so editing an entry does not move it in the list.

### 5. Server code

- `src/app.d.ts`: declare `App.Platform` with `env: { DB: D1Database; ADMIN_SECRET: string }`, and `App.Locals` with `isAdmin: boolean`.
- `src/lib/server/db.ts` (every statement prepared with `.bind()`, SQL-injection safe):
  - `listEntries(db, limit, offset = 0)`: `SELECT id, email, message, created_at FROM guestbook_entries ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`. The public load passes `site.entryLimit` from [`src/lib/config.ts`](#2-site-metadata-srclibconfigts) and no offset; the admin load passes `site.adminPageSize` and the offset for the requested page. `id DESC` is not decoration here: `created_at` is second-granular, and without a unique tiebreak SQLite may order same-second rows differently between two queries, which on an offset scan drops or repeats a row at a page boundary.
  - `countEntries(db)`: `SELECT COUNT(*) AS n FROM guestbook_entries`, for the admin page count.
  - `addEntry(db, email, message)`.
  - `updateEntry(db, id, email, message)`: `UPDATE … SET email = ?, message = ? WHERE id = ?`; returns whether a row matched.
  - `deleteEntry(db, id)`: returns whether a row matched, so deleting an already-deleted id reports "not found" rather than silent success.
- `src/lib/paginate.ts` (pure, unit-testable): `paginate(total, page, pageSize)` returns `{ offset, pageCount, hasPrev, hasNext }`. All the arithmetic lives here rather than in the route, so off-by-one errors are caught by unit tests instead of by clicking. `pageCount` is at least 1, so an empty table reads "Page 1 of 1" rather than "of 0".
- `src/lib/redact.ts` (pure, unit-testable): `redactEmail(email)` returns first character + `***` + `@` + domain (`alice@example.com` → `a***@example.com`). A local part of one character redacts to `***@example.com` rather than leaking the whole of it.
- `src/lib/validation.ts` (pure, unit-testable), shared by the public and admin forms so an admin edit cannot store what a public submission could not:
  - `message`: trim; required; ≤ 1000 chars; reject control characters other than `\n`.
  - `email`: trim; required; ≤ 254 chars; pragmatic regex format check.
- `src/lib/server/auth.ts` (Web Crypto only, no dependencies):
  - `verifySecret(expected, submitted)`: constant-time compare over the encoded bytes, so a wrong secret costs the same time whatever its prefix. Compare a fixed-length digest of each side rather than the raw strings, so length alone leaks nothing.
  - `signSession(secret, expiresAt)` / `verifySession(secret, cookie)`: cookie value is `<expiresAt>.<base64url HMAC-SHA256 of expiresAt>`, keyed by `ADMIN_SECRET`. `verifySession` recomputes the HMAC, compares it constant-time, and rejects an expired `expiresAt`. The secret is the HMAC key and never appears in the cookie, so rotating `ADMIN_SECRET` invalidates every outstanding session.
  - Session TTL comes from `site.sessionTtlHours`, and the same value sets the cookie's `maxAge`, so the signature and the cookie expire together.
- `src/hooks.server.ts`, one `handle` hook doing both jobs:
  - Sets `Content-Security-Policy: default-src 'self'` on every response.
  - For `/admin` and below, except `/admin/login`: verify the `admin_session` cookie and set `locals.isAdmin`. On failure, redirect to `/admin/login` (303). The gate is on the path prefix, so an unauthenticated request never reaches an admin `load` or action.
- `src/routes/+page.server.ts` (public):
  - `load()` maps entries through `redactEmail` and returns `{ id, message, emailMasked, created_at }`. The full address is dropped in the load function, not the template, so it never reaches the serialized page payload.
  - Returns an empty array plus an explicit notice flag when `platform.env.DB` is missing, so the page renders before DB setup and says why the list is empty.
  - `actions.default` validates, inserts, returns `fail(400, …)` with field errors and the submitted values, so a failed post re-renders the form filled in. Add is the only public action.
- `src/routes/admin/login/+page.server.ts`:
  - `actions.default` reads the `secret` field, checks it with `verifySecret`, and on success sets `admin_session` via `cookies.set` with `httpOnly: true`, `secure: true`, `sameSite: 'strict'`, `path: '/admin'`, `maxAge` matching the TTL. On failure returns `fail(400, { error: 'Invalid secret' })` with no detail about which part was wrong, and never echoes the submitted secret back into the form.
  - A missing `ADMIN_SECRET` binding fails the request loudly instead of authenticating anyone: an unset secret must not compare equal to an empty submission.
- `src/routes/admin/+page.server.ts`:
  - `load({ url })` reads `?page` (absent means 1), returns full entries for that page with emails unredacted, plus `{ page, pageCount, total, hasPrev, hasNext }` from `paginate(countEntries(db), page, site.adminPageSize)`.
  - A `?page` value that is not a positive integer is a 400, not a silent fall back to page 1. A well-formed page past the last one renders the empty table with its "Page 7 of 3" state visible, rather than redirecting, so a stale bookmark shows what is wrong instead of quietly landing somewhere else.
  - `actions.create`, `actions.update`, `actions.delete` (validating `id` as a positive integer), `actions.logout` (deletes the cookie, redirects to `/admin/login`). Each returns `fail(400, …)` with field errors, or `fail(404, …)` when the id matched no row.
  - Every mutating action carries the current `page` in a hidden field and redirects back to `/admin?page=<page>` on success, so editing row 3 of page 4 returns to page 4. Deleting the last entry on the last page can leave that page empty; the empty state and its links are the same ones the out-of-range case renders, so there is no separate path to get wrong.

### 6. UI

Every form is a plain `<form method="POST">` with `use:enhance`, so all of it works without JavaScript.

`src/routes/+layout.svelte`:

- `<svelte:head>` with the title, description, and canonical link from `site` in [`src/lib/config.ts`](#2-site-metadata-srclibconfigts). No page hardcodes the site name.

`src/routes/+page.svelte` (public):

- Hello-world hero ("Hello, world - Cloudflare edge starter").
- Email + message fields with inline validation errors.
- Entry list under the heading `Latest {site.entryLimit} guestbook entries`, rendering `{entry.message}` / `{entry.emailMasked}` via normal Svelte template expressions. Heading and query read the same field, so changing the limit changes both.
- No pagination on the public page. The newest 20 are the whole of what a visitor sees; older rows stay in D1, reachable only from `/admin`.
- No link to `/admin`: the admin view is reachable by typing the URL.

`src/routes/admin/login/+page.svelte`:

- One `type="password"` secret field and a submit button, with the error message from `fail`.
- `<svelte:head>` sets `<meta name="robots" content="noindex, nofollow">`, as does the admin page.

`src/routes/admin/+page.svelte`:

- Table of every entry, newest first, `site.adminPageSize` rows per page, with full email, message, and `created_at`.
- Pagination controls under the table: "Page {page} of {pageCount} ({total} entries)", with Previous and Next as plain `<a href="/admin?page=N">` links, disabled (rendered as text, not links) at the ends. Links, not buttons, so paging works without JavaScript and a page is bookmarkable.
- Per row: an inline edit form (email + message, prefilled) posting to `?/update` with hidden `id` and `page`, and a delete button posting to `?/delete` with the same hidden fields. Delete asks for confirmation in the browser; the server does not treat that as a check.
- An add form posting to `?/create`, and a logout button posting to `?/logout`.
- Empty state (no entries at all, or a page past the last): a line saying so plus a link back to page 1.

### 7. Security (XSS, injection, admin access)

Following the faramir convention of naming both halves:

#### Prevented

| Failure                                                         | How                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stored XSS.** A message like `<script>alert(1)</script>`.     | Output encoding: Svelte auto-escapes `{…}` expressions, so the payload renders as inert text. Never `{@html}` for user content. Store raw input, escape on output — no lossy input mangling.                                                                        |
| **SQL injection.**                                              | D1 prepared statements with `.bind()` everywhere; no string-built SQL.                                                                                                                                                                                              |
| **Client-side validation bypass.**                              | Server-side validation on every submission; client `required` attrs are UX only.                                                                                                                                                                                    |
| **CSRF.**                                                       | SvelteKit's built-in origin check on form actions stays enabled.                                                                                                                                                                                                    |
| **Inline-script injection surviving a template mistake.**       | Content-Security-Policy (`default-src 'self'`) set in a `handle` hook in `src/hooks.server.ts` — defense in depth behind the escaping, not a substitute for it.                                                                                                     |
| **Trivial spam bots.**                                          | Honeypot form field; free, no external service.                                                                                                                                                                                                                     |
| **The admin secret leaking to the client.**                     | `ADMIN_SECRET` is a Worker secret read only in server code (`.server.ts` files and `hooks.server.ts`), which SvelteKit refuses to import into client bundles. It is never returned from a `load`, never put in a cookie, and never echoed back into the login form. |
| **The admin secret leaking through the repo.**                  | Set with `wrangler secret put`, not a `vars` entry in the committed `wrangler.jsonc`. Locally it comes from `.dev.vars`, which is gitignored; only `.dev.vars.example` with a placeholder is committed.                                                             |
| **Guessing the secret by timing.**                              | Constant-time comparison in `verifySecret` and in the session HMAC check.                                                                                                                                                                                           |
| **Forged admin sessions.**                                      | The cookie carries an expiry plus an HMAC-SHA256 signature keyed by `ADMIN_SECRET`. Editing the expiry invalidates the signature; forging one requires the secret.                                                                                                  |
| **Session cookie theft via JavaScript or cross-site requests.** | `httpOnly`, `secure`, `sameSite: 'strict'`, `path: '/admin'`, so the cookie is unreadable from JS, not sent over plain HTTP, and not attached to cross-site navigations.                                                                                            |
| **An unauthenticated request reaching an admin route.**         | Gated on the `/admin` path prefix in `hooks.server.ts`, ahead of any `load` or action. A route added under `/admin` later is protected by where it sits.                                                                                                            |
| **Stale sessions outliving a rotated secret.**                  | The secret is the HMAC key, so `wrangler secret put ADMIN_SECRET` invalidates every outstanding session with no session store to clear.                                                                                                                             |
| **Public exposure of stored emails.**                           | The public `load` returns only `redactEmail(...)` output. The full address is never selected into the page payload, so "view source" shows the mask, not the address.                                                                                               |
| **Admin edits bypassing validation.**                           | Admin create and update run the same `validation.ts` as the public form.                                                                                                                                                                                            |
| **Injection through `?page` or a row `id`.**                    | Both are parsed to integers and rejected if they are not positive integers, then bound with `.bind()`. `LIMIT`/`OFFSET` are bound parameters, never interpolated into the SQL string.                                                                               |

#### Not prevented

| Failure                                    | Why                                                                                                                                                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Determined spam / abuse.**               | No CAPTCHA, rate limiting, or moderation. Out of scope for a starter; noted in the README as the first extension.                                                                                                                                         |
| **Brute force against `/admin/login`.**    | No rate limiting or lockout. Cloudflare's free plan has no Rate Limiting rules, and a Worker-side counter needs KV or Durable Objects. The mitigation the README states is a long random secret (32+ bytes from a password manager), not a memorable one. |
| **Email harvesting by the admin account.** | Redaction is a display choice on the public page. The full addresses are in D1 and on `/admin`; anyone with the secret has all of them.                                                                                                                   |
| **Accountability for admin actions.**      | One shared `admin` account, no per-user identity and no audit log, so an edit or delete cannot be attributed. Multi-user auth is the named extension.                                                                                                     |
| **Losing the secret.**                     | No recovery flow. `wrangler secret put ADMIN_SECRET` sets a new one; there is nothing else to reset.                                                                                                                                                      |

### 8. Tests

Unit tests only. No integration or end-to-end suite: no `@cloudflare/vitest-pool-workers`, no Miniflare harness, no Playwright, no test that starts the app or opens a browser. Everything under test is a pure function or a Web Crypto call that Node 24 provides natively, so the suite is plain Vitest in a node environment.

- `validation.ts`: valid/invalid emails, length limits, control characters, and XSS-payload strings passing through untouched — escaping is output's job, and a test asserting the payload survives validation documents that.
- `paginate.ts`: first, middle, and last page offsets; `hasPrev`/`hasNext` at both ends; a total that divides evenly by the page size (no phantom trailing page); a total of 0 (`pageCount` 1, both flags false); a page past the last (offset past the end, `hasNext` false).
- `redact.ts`: a normal address masks to `a***@domain`; a one-character local part masks to `***@domain`; the domain survives; the original address does not appear anywhere in the output.
- `auth.ts`: `verifySecret` accepts the exact secret and rejects a wrong one, a prefix, an empty string, and a differing-length value. `verifySession` accepts what `signSession` produced, and rejects a tampered expiry, a tampered signature, a value signed with a different secret, and an expired-but-correctly-signed token (expiry passed in, so the test needs no clock control).
- `npm run check` (svelte-check) for type safety; both it and `npm test` run in CI.

The route handlers, the hooks gate, and the D1 queries are covered by the one-time [Verification](#verification-agent-executable) run below, not by an automated suite.

### 9. README

Structured like the sibling READMEs — terse opening sentence, then Installation / Usage / Developing:

- One-sentence description linking SvelteKit, Cloudflare Workers, and D1, and naming the two views.
- **Requirements**: Node 24 (`.nvmrc`), a free Cloudflare account.
- **Usage** (local): `npm install` → `cp .dev.vars.example .dev.vars` and put a real secret in it → `npm run migrate` (applies migrations locally) → `npm run dev`. Public page at `/`, admin at `/admin`.
- **Deploying**: `npx wrangler login` → `npx wrangler d1 create guestbook-db` → paste `database_id` into `wrangler.jsonc` → `npx wrangler d1 migrations apply guestbook-db --remote` → `npx wrangler secret put ADMIN_SECRET` → `npm run deploy` → live at `https://cloudflare-starter.<account>.workers.dev`.
- **Configuration**: `src/lib/config.ts` is the one place for site metadata (title, description, domain, public entry limit, admin page size, session TTL). `wrangler.jsonc` holds Cloudflare platform config; secrets are neither.
- **Admin access**: the account is `admin` and the secret is whatever `ADMIN_SECRET` holds. Generate a long random value (`openssl rand -base64 32`) and keep it in a password manager. Rotate with `npx wrangler secret put ADMIN_SECRET`, which signs out every open session. Never commit it and never put it in `wrangler.jsonc`.
- The free-tier limits table from this plan, with an explicit note that every service used is on the free plan.
- **Developing**: the npm scripts, one line each. This is the only place they are described, so every script listed in [Repository conventions](#repository-conventions) gets a line.
- **Out of scope / extensions**: the [Not prevented](#not-prevented) items, custom domain, multi-user auth and an audit log, moderation queue, keyset pagination and search on the admin table, pagination on the public page.

## Verification (agent-executable)

1. `npm install && npm run check` — types clean, lint clean.
2. `npm run build` — adapter produces `.svelte-kit/cloudflare/_worker.js`.
3. `npm run migrate` then run the app locally (`npm run dev`, or `npx wrangler dev` after build).
4. `curl` the home page → 200 with hello-world content and the "Latest 20 guestbook entries" heading.
5. POST a guestbook entry via `curl` (form-encoded, `origin` header set) → entry appears on subsequent GET.
6. POST message `<script>alert(1)</script>` → response HTML contains `&lt;script&gt;`, not `<script>` — XSS defense verified against real bytes, not just the unit test.
7. POST with the honeypot field filled → entry is not stored.
8. GET the home page after step 5 → the submitted address appears only as `a***@domain`; the full address is absent from the response body.
9. GET `/admin` with no cookie → 303 to `/admin/login`; the response body carries no entry data.
10. POST a wrong secret to `/admin/login` → 400, no `Set-Cookie`.
11. POST the correct secret → `Set-Cookie: admin_session=…` carrying `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/admin`, and no part of the secret. Following GET `/admin` → 200 listing full email addresses.
12. Flip one character of the cookie's signature and GET `/admin` → 303 to `/admin/login`.
13. With a valid cookie: POST `?/create`, then `?/update` on that id, then `?/delete` → each reflected in the next GET. `?/update` with an id that does not exist → 400/404, no row created.
14. Seed more rows than `site.adminPageSize` (a loop of POSTs, or one `wrangler d1 execute` insert), then GET `/admin` → page 1 holds exactly `adminPageSize` rows and the footer reads "Page 1 of N". GET `/admin?page=2` → the next rows, none repeated from page 1 and none skipped between them. This is the check that catches an ordering or offset error, so compare the actual id lists.
15. GET `/admin?page=0`, `?page=-1`, `?page=abc` → 400. GET `/admin?page=<N+1>` → 200, empty table, and a link back to page 1.
16. POST `?/delete` from page 2 → the response returns to `/admin?page=2`, not page 1.
17. POST `?/logout` → cookie cleared, and a following GET `/admin` redirects.
18. `npm test` — Vitest unit suite passes.
19. The actual Cloudflare deploy is left to the user (needs their account login); the README documents it step-by-step.

These `curl` checks are a one-time manual pass run while building, not files committed to the repo. Nothing here becomes an automated integration test.

## Out of scope

Custom domain, multi-user auth and an audit log (the one shared `admin` account is the whole auth model), a moderation queue, keyset pagination and search on the admin table, pagination on the public page, CAPTCHA or paid bot management, rate limiting on the login form. All noted in the README as natural extensions.

## Delivery

On approval, build the full scaffold as described above, keep this plan as `plan.md` in the repo for reference, run the verification steps, then commit and push.
