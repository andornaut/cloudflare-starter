# cloudflare-starter

[![Test](https://github.com/andornaut/cloudflare-starter/actions/workflows/test.yml/badge.svg)](https://github.com/andornaut/cloudflare-starter/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/MIT)

cloudflare-starter is a [SvelteKit](https://svelte.dev/docs/kit/introduction) guestbook that runs entirely on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with a [D1](https://developers.cloudflare.com/d1/) database, on free-tier services only

## Features

- Two views over one table: a public guestbook and an [admin view](#admin-access)
- Server-rendered at the edge, and every form works without JavaScript
- Redacted email addresses on the public page, full ones for the admin
- Signed, expiring admin sessions with no session store to keep
- Unit-tested [validation, pagination, redaction, and session code](#developing)

| View   | Route    | Who                    | Can               | Sees                                       | Extent                 |
| ------ | -------- | ---------------------- | ----------------- | ------------------------------------------ | ---------------------- |
| Public | `/`      | anyone                 | add only          | message + redacted email (`a***@host.com`) | newest 20, no paging   |
| Admin  | `/admin` | anyone with the secret | add, edit, delete | message + full email                       | every entry, paginated |

## Requirements

- Node 24 (`.nvmrc`)
- A free Cloudflare account

Every service used is on the free plan:

| Service                        | Free limit                                          | Guestbook usage  |
| ------------------------------ | --------------------------------------------------- | ---------------- |
| Workers                        | 100k requests/day, 10 ms CPU/request                | SSR + form posts |
| D1                             | 5 GB storage, 5M row reads/day, 100k row writes/day | One small table  |
| Static assets on Workers       | Free, unmetered                                     | JS/CSS bundles   |
| `<name>.workers.dev` subdomain | Free                                                | No custom domain |

## Usage

```bash
git clone git@github.com:andornaut/cloudflare-starter.git
cd cloudflare-starter
npm install
cp .dev.vars.example .dev.vars   # then put a real secret in it
npm run migrate                  # applies migrations to the local D1 database
npm run dev
```

The public page is at `/` and the admin sign-in at `/admin/login`.

The session cookie is `Secure`, which Safari refuses to store over `http://localhost`. Sign in to the admin view with Chrome or Firefox when developing locally.

## Deploying

```bash
npx wrangler login
npx wrangler d1 create guestbook-db          # paste the printed database_id into wrangler.jsonc
npx wrangler d1 migrations apply guestbook-db --remote
npx wrangler secret put ADMIN_SECRET
npm run deploy
```

The Worker is then live at `https://cloudflare-starter.<account>.workers.dev`. To serve a custom domain instead, add a `routes` entry to `wrangler.jsonc`.

## Configuration

`src/lib/config.ts` holds site metadata: title, description, canonical domain, the public entry limit, the admin page size, and the session lifetime. Rendered text and the query limit it describes read the same field, so a limit cannot change in one place only.

`wrangler.jsonc` holds Cloudflare platform config: Worker name, compatibility date, and the `DB` binding. Secrets are in neither file.

## Admin access

Sign-in takes a secret and no username: whatever `ADMIN_SECRET` holds. Generate a long random value and keep it in a password manager:

```bash
openssl rand -base64 32
```

Rotate it with `npx wrangler secret put ADMIN_SECRET`. That signs out every open session, because the secret is also the key the session cookie is signed with. Never commit it, and never put it in `wrangler.jsonc`, which is committed.

## Developing

Use `make check` for the complete automation gate with stock Node.js and ShellCheck
images. It does not build a project image.
It runs formatting, Markdown, lint, type checks, unit tests, and the Worker build.

Optional `make build` runs the build checks and exports `.svelte-kit/cloudflare/`.
Other checks keep generated files in disposable scratch.

Native npm commands run locally and do not delegate to Make. Select the Node.js
version in `.nvmrc` and install the lockfile dependencies with `npm ci`.

```bash
make check
make build
npm test -- src/lib/paginate.test.ts
npm run check
npm run lint
npm run build
npm run format
npm run dev
```

The pre-commit hook runs `npx lint-staged --concurrent false` with local Prettier
and ESLint. It automatically fixes staged files while preserving partial staging.

The suite is unit tests only: the pure functions in `validation.ts`, `paginate.ts`, and `redact.ts`, plus the Web Crypto session code in `server/auth.ts`. The route handlers, the `/admin` gate, and the D1 queries are checked by hand against a dev server.
