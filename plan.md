# Cloudflare Guestbook Starter — Implementation Plan

## Context

This repo (`andornaut/cloudflare-starter`) is empty except for a LICENSE. The goal is a starter/scaffold project: a "hello world" home page with a guestbook. Visitors submit a message + email; entries are stored in a database and rendered back safely (no XSS). Everything runs on Cloudflare's edge, using only free-tier services. The plan must be complete enough for an agent to execute end-to-end.

## Stack decision (Go is not the right fit)

- **Backend language: TypeScript, not Go.** Cloudflare Workers natively run JavaScript/TypeScript. Go only runs via TinyGo compiled to WASM using community-maintained bindings (`syumai/workers`); standard Go binaries exceed the free plan's 3 MB script-size limit, TinyGo's D1 support is unofficial, and debugging/DX is poor. TypeScript gets first-class D1 bindings, official tooling, and the fastest cold starts.
- **Framework: SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`.** Since the UI is Svelte anyway, SvelteKit collapses frontend + backend into a single Worker: server-rendered pages at the edge, form actions for the API, static assets served free. No separate API service needed.
- **Database: Cloudflare D1** (SQLite at the edge), bound to the Worker as `platform.env.DB`.
- **Tooling: Wrangler CLI** for local dev (Miniflare emulation), D1 migrations, and deploys.

## Free-tier fit (no paid services)

| Service | Free limit | Guestbook usage |
| --- | --- | --- |
| Workers | 100k requests/day, 10 ms CPU/request | SSR + form posts — trivial |
| D1 | 5 GB storage, 5M row reads/day, 100k row writes/day | One tiny table |
| Static assets on Workers | Free, unmetered | JS/CSS bundles |
| `<name>.workers.dev` subdomain | Free | No custom domain required |

## Architecture

Single Cloudflare Worker (SvelteKit app) serving server-rendered pages and form actions, backed by a D1 database. Static assets are served from the Worker's asset store.

## Implementation steps

### 1. Scaffold SvelteKit

- `npx sv create` (minimal template, TypeScript) or hand-author the equivalent files.
- Install `@sveltejs/adapter-cloudflare`, set it in `svelte.config.js`.
- Add `wrangler` and `@cloudflare/workers-types` as dev dependencies.

### 2. Cloudflare config — `wrangler.jsonc`

- Worker name, compatibility date, adapter output as the main entry, assets binding, and a `d1_databases` binding named `DB` for `guestbook-db`.
- The adapter's dev-mode platform proxy (`getPlatformProxy`) makes `platform.env.DB` work in `vite dev` against a local SQLite file.

### 3. Database migration — `migrations/0001_create_guestbook.sql`

- Create the `guestbook_entries` table: `id` (integer primary key), `email` (text), `message` (text), `created_at` (timestamp, default now).

### 4. Server code

- `src/app.d.ts`: declare `App.Platform` with `env: { DB: D1Database }`.
- `src/lib/server/db.ts`:
  - `listEntries(db)` — `SELECT id, email, message, created_at FROM guestbook_entries ORDER BY created_at DESC, id DESC LIMIT 50`.
  - `addEntry(db, email, message)` — prepared statement with `.bind()` (SQL-injection safe).
- `src/lib/validation.ts` (pure, unit-testable):
  - `message`: trim; required; ≤ 1000 chars; strip/reject control characters (allow `\n`).
  - `email`: trim; required; ≤ 254 chars; pragmatic regex format check.
- `src/routes/+page.server.ts`:
  - `load()` returns entries (empty array + a notice flag if `platform.env.DB` is missing, so the page still renders before DB setup).
  - `actions.default` validates, inserts, returns `fail(400, …)` with field errors on invalid input.

### 5. UI — `src/routes/+page.svelte`

- Hello-world hero ("Hello, world — Cloudflare edge starter").
- `<form method="POST" use:enhance>` with email + message fields, inline validation errors (works without JS; progressively enhanced).
- Entry list rendering `{entry.message}` / `{entry.email}` via normal Svelte template expressions.

### 6. Security (XSS + injection)

- **Output encoding is the XSS defense**: Svelte auto-escapes `{…}` expressions. Never use `{@html}` for user content — a payload like `<script>alert(1)</script>` renders as inert text. Store raw input; escape on output (the correct pattern — no lossy input mangling).
- **SQL injection**: D1 prepared statements with `.bind()` everywhere; no string-built SQL.
- **Server-side validation** on every submission (client `required` attrs are UX only).
- **Defense in depth**: Content-Security-Policy (e.g. `default-src 'self'`) via SvelteKit handle hook in `src/hooks.server.ts`; SvelteKit's built-in CSRF origin check stays enabled.
- **Honeypot form field** to deter trivial spam bots (free; no external service).

### 7. Tests

- Vitest unit tests for `validation.ts` (valid/invalid emails, length limits, control chars, XSS-payload strings pass through untouched — escaping is output's job).
- `npm run check` (svelte-check) for type safety.

### 8. README

- Prereqs (Node 20+, free Cloudflare account).
- Local dev: `npm install` → `npx wrangler d1 migrations apply guestbook-db --local` → `npm run dev`.
- Deploy: `npx wrangler login` → `npx wrangler d1 create guestbook-db` → paste `database_id` into `wrangler.jsonc` → `npx wrangler d1 migrations apply guestbook-db --remote` → `npm run build && npx wrangler deploy` → app live at `https://cloudflare-guestbook.<account>.workers.dev`.
- Explicit note that every service used is on the free plan, with the limits table.

## Verification (agent-executable)

1. `npm install && npm run check` — types clean.
2. `npm run build` — adapter produces `.svelte-kit/cloudflare/_worker.js`.
3. `npx wrangler d1 migrations apply guestbook-db --local` then run the app locally (`npm run dev` or `npx wrangler dev` after build).
4. `curl` the home page → 200 with hello-world content.
5. POST a guestbook entry via `curl` (form-encoded, include `origin` header) → entry appears on subsequent GET.
6. POST message `<script>alert(1)</script>` → response HTML contains `&lt;script&gt;`, not `<script>` — XSS defense verified.
7. Run Vitest suite.
8. Actual Cloudflare deploy is left to the user (needs their account login); README documents it step-by-step.

## Out of scope

Custom domain, auth/moderation/admin UI, pagination beyond LIMIT 50, CAPTCHA or paid bot management. All noted in README as natural extensions.

## Delivery

On approval, build the full scaffold as described above, include this plan as `plan.md` in the repo for reference, run the verification steps, then commit and push.
