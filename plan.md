# Cloudflare Guestbook Starter — Implementation Plan

## Context

This repo (`andornaut/cloudflare-starter`) is empty except for a LICENSE (MIT). The goal is a starter/scaffold project: a "hello world" home page with a guestbook. Visitors submit a message + email; entries are stored in a database and rendered back safely (no XSS). Everything runs on Cloudflare's edge, using only free-tier services. The plan must be complete enough for an agent to execute end-to-end.

## Stack decision (Go is not the right fit)

- **Backend language: TypeScript, not Go.** Cloudflare Workers natively run JavaScript/TypeScript. Go only runs via TinyGo compiled to WASM using community-maintained bindings (`syumai/workers`); standard Go binaries exceed the free plan's 3 MB script-size limit, TinyGo's D1 support is unofficial, and debugging/DX is poor. TypeScript gets first-class D1 bindings, official tooling, and the fastest cold starts.
- **Framework: SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`.** Since the UI is Svelte anyway, SvelteKit collapses frontend + backend into a single Worker: server-rendered pages at the edge, form actions for the API, static assets served free. No separate API service needed.
- **Database: Cloudflare D1** (SQLite at the edge), bound to the Worker as `platform.env.DB`.
- **Tooling: Wrangler CLI** for local dev (Miniflare emulation), D1 migrations, and deploys. A Makefile fronts the npm scripts so the daily commands read the same here as in the sibling repos.

## Free-tier fit (no paid services)

Service | Free limit | Guestbook usage
--- | --- | ---
Workers | 100k requests/day, 10 ms CPU/request | SSR + form posts — trivial
D1 | 5 GB storage, 5M row reads/day, 100k row writes/day | One tiny table
Static assets on Workers | Free, unmetered | JS/CSS bundles
`<name>.workers.dev` subdomain | Free | No custom domain required

## Architecture

Single Cloudflare Worker (the SvelteKit app) serving server-rendered pages and form actions, backed by a D1 database. Static assets are served from the Worker's asset store. The Worker is named `cloudflare-starter`, after the repo, so the deployed URL and the checkout agree.

## Repository conventions

Carried over from the sibling repos (`faramir`, `filectrl`, `ansible-ctrl`, `ai-maintainer`) so this starter behaves like the rest of the account:

- **Makefile as the front door.** `make help` lists the targets; each target has a `## name: description` comment the help target renders. Targets delegate to npm/wrangler: `dev`, `build`, `check`, `lint`, `fmt`, `test`, `migrate`, `deploy`, `clean`. The README's Developing section shows `make` commands, not raw npm ones.
- **CI under `.github/workflows/`**, pinned action versions (e.g. `actions/checkout@v7.0.1`), `permissions: contents: read`, a `concurrency` group with `cancel-in-progress: true`, and `workflow_dispatch` on every workflow.
  - `test.yml` — on push to `main` and pull requests: install, `svelte-check`, lint, Vitest, build. The gate is the whole repo, not the lines a change touched.
  - `ai-attributions.yml` — the account-standard scan (`andornaut/ai-attributions@v1`), on push to every branch, pull requests, and dispatch, matching the copy in every sibling repo.
- **`.github/dependabot.yml`** — weekly `npm` and `github-actions` updates with `cooldown: default-days: 7`, as in filectrl.
- **`.markdownlint.json`** — disable `line-length` and `no-inline-html`, as in filectrl.
- **`.nvmrc`** pinning Node 22 (current LTS), so nvm/fnm — and ai-maintainer's toolchain detection — resolve the right runtime.
- **Fail loudly.** Invalid input returns a 400 with field errors; a missing D1 binding renders the page with an explicit notice rather than a blank list; nothing is silently ignored.

## Implementation steps

### 1. Scaffold SvelteKit

- `npx sv create` (minimal template, TypeScript) or hand-author the equivalent files.
- Install `@sveltejs/adapter-cloudflare`, set it in `svelte.config.js`.
- Add `wrangler`, `@cloudflare/workers-types`, `vitest`, `prettier` + `prettier-plugin-svelte`, and `eslint` + `eslint-plugin-svelte` as dev dependencies.
- Add the Makefile, `.nvmrc`, `.gitignore`, `.markdownlint.json`, and the `.github/` files from [Repository conventions](#repository-conventions).

### 2. Cloudflare config — `wrangler.jsonc`

- Worker name `cloudflare-starter`, compatibility date, the adapter's output as the main entry, an assets binding, and a `d1_databases` binding named `DB` for database `guestbook-db` (placeholder `database_id` until `wrangler d1 create` mints the real one).
- The adapter's dev-mode platform proxy (`getPlatformProxy`) makes `platform.env.DB` work in `vite dev` against a local SQLite file.

### 3. Database migration — `migrations/0001_create_guestbook.sql`

- Create `guestbook_entries`: `id` (integer primary key), `email` (text, not null), `message` (text, not null), `created_at` (text, not null, default `CURRENT_TIMESTAMP`).
- `CURRENT_TIMESTAMP` is second-granular, so same-second inserts tie; the list query breaks the tie on `id`, which only advances.

### 4. Server code

- `src/app.d.ts`: declare `App.Platform` with `env: { DB: D1Database }`.
- `src/lib/server/db.ts`:
  - `listEntries(db)` — `SELECT id, email, message, created_at FROM guestbook_entries ORDER BY created_at DESC, id DESC LIMIT 50`.
  - `addEntry(db, email, message)` — prepared statement with `.bind()` (SQL-injection safe).
- `src/lib/validation.ts` (pure, unit-testable):
  - `message`: trim; required; ≤ 1000 chars; reject control characters other than `\n`.
  - `email`: trim; required; ≤ 254 chars; pragmatic regex format check.
- `src/routes/+page.server.ts`:
  - `load()` returns entries, or an empty array plus an explicit notice flag when `platform.env.DB` is missing, so the page renders before DB setup and says why the list is empty.
  - `actions.default` validates, inserts, returns `fail(400, …)` with field errors and the submitted values, so a failed post re-renders the form filled in.

### 5. UI — `src/routes/+page.svelte`

- Hello-world hero ("Hello, world — Cloudflare edge starter").
- `<form method="POST" use:enhance>` with email + message fields, inline validation errors. Works without JavaScript; `use:enhance` progressively enhances it.
- Entry list rendering `{entry.message}` / `{entry.email}` via normal Svelte template expressions.

### 6. Security (XSS + injection)

Following the faramir convention of naming both halves:

#### Prevented

Failure | How
--- | ---
**Stored XSS.** A message like `<script>alert(1)</script>`. | Output encoding: Svelte auto-escapes `{…}` expressions, so the payload renders as inert text. Never `{@html}` for user content. Store raw input, escape on output — no lossy input mangling.
**SQL injection.** | D1 prepared statements with `.bind()` everywhere; no string-built SQL.
**Client-side validation bypass.** | Server-side validation on every submission; client `required` attrs are UX only.
**CSRF.** | SvelteKit's built-in origin check on form actions stays enabled.
**Inline-script injection surviving a template mistake.** | Content-Security-Policy (`default-src 'self'`) set in a `handle` hook in `src/hooks.server.ts` — defense in depth behind the escaping, not a substitute for it.
**Trivial spam bots.** | Honeypot form field; free, no external service.

#### Not prevented

Failure | Why
--- | ---
**Determined spam / abuse.** | No CAPTCHA, rate limiting, or moderation. Out of scope for a starter; noted in the README as the first extension.
**Email harvesting.** | Submitted emails render on a public page. A real deployment would mask or drop them; the starter keeps the round-trip visible on purpose.

### 7. Tests

- Vitest unit tests for `validation.ts`: valid/invalid emails, length limits, control characters, and XSS-payload strings passing through untouched — escaping is output's job, and a test asserting the payload survives validation documents that.
- `npm run check` (svelte-check) for type safety; both run in CI via `make check` and `make test`.

### 8. README

Structured like the sibling READMEs — terse opening sentence, then Installation / Usage / Developing:

- One-sentence description linking SvelteKit, Cloudflare Workers, and D1.
- **Requirements**: Node 22 (`.nvmrc`), a free Cloudflare account.
- **Usage** (local): `npm install` → `make migrate` (applies migrations locally) → `make dev`.
- **Deploying**: `npx wrangler login` → `npx wrangler d1 create guestbook-db` → paste `database_id` into `wrangler.jsonc` → `npx wrangler d1 migrations apply guestbook-db --remote` → `make deploy` → live at `https://cloudflare-starter.<account>.workers.dev`.
- The free-tier limits table from this plan, with an explicit note that every service used is on the free plan.
- **Developing**: the `make` targets, one line each.
- **Out of scope / extensions**: the [Not prevented](#not-prevented) items, custom domain, auth/moderation/admin UI, pagination beyond LIMIT 50.

## Verification (agent-executable)

1. `npm install && make check` — types clean, lint clean.
2. `make build` — adapter produces `.svelte-kit/cloudflare/_worker.js`.
3. `make migrate` then run the app locally (`make dev`, or `npx wrangler dev` after build).
4. `curl` the home page → 200 with hello-world content.
5. POST a guestbook entry via `curl` (form-encoded, `origin` header set) → entry appears on subsequent GET.
6. POST message `<script>alert(1)</script>` → response HTML contains `&lt;script&gt;`, not `<script>` — XSS defense verified against real bytes, not just the unit test.
7. POST with the honeypot field filled → entry is not stored.
8. `make test` — Vitest suite passes.
9. The actual Cloudflare deploy is left to the user (needs their account login); the README documents it step-by-step.

## Out of scope

Custom domain, auth/moderation/admin UI, pagination beyond LIMIT 50, CAPTCHA or paid bot management, email masking. All noted in the README as natural extensions.

## Delivery

On approval, build the full scaffold as described above, keep this plan as `plan.md` in the repo for reference, run the verification steps, then commit and push.
