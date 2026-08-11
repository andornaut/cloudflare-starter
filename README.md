# cloudflare-starter

cloudflare-starter is a [SvelteKit](https://svelte.dev/docs/kit) guestbook that runs entirely on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with a [D1](https://developers.cloudflare.com/d1/) database, on free-tier services only

## Features

- Two views over one table: a public guestbook and an [admin view](#admin-access)
- Server-rendered at the edge, and every form works without JavaScript
- [Redacted email addresses](#what-it-protects-against) on the public page
- Signed, expiring admin sessions with no session store to keep
- Unit-tested [validation, pagination, redaction, and session code](#developing)

| View   | Route    | Who                     | Can               | Sees                                       | Extent                 |
| ------ | -------- | ----------------------- | ----------------- | ------------------------------------------ | ---------------------- |
| Public | `/`      | anyone                  | add only          | message + redacted email (`a***@host.com`) | newest 20, no paging   |
| Admin  | `/admin` | the one `admin` account | add, edit, delete | message + full email                       | every entry, paginated |

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

The account is `admin` and the secret is whatever `ADMIN_SECRET` holds. Generate a long random value and keep it in a password manager:

```bash
openssl rand -base64 32
```

Rotate it with `npx wrangler secret put ADMIN_SECRET`. That signs out every open session, because the secret is also the key the session cookie is signed with. Never commit it, and never put it in `wrangler.jsonc`, which is committed.

## What it protects against

### Prevented

| Failure                                                         | How                                                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stored XSS.** A message like `<script>alert(1)</script>`.     | Output encoding. Svelte escapes `{...}` expressions, so the payload renders as inert text. Input is stored raw and escaped on render, never via `{@html}`. |
| **SQL injection.**                                              | D1 prepared statements with `.bind()` everywhere, including `LIMIT` and `OFFSET`. No string-built SQL.                                                     |
| **Client-side validation bypass.**                              | Server-side validation on every submission. The `required` attributes are UX only.                                                                         |
| **CSRF.**                                                       | SvelteKit's origin check on form actions.                                                                                                                  |
| **Inline-script injection surviving a template mistake.**       | `Content-Security-Policy: default-src 'self'`, with a per-response nonce on `script-src` so only SvelteKit's own hydration script runs.                    |
| **Trivial spam bots.**                                          | A honeypot field. Free, and no external service.                                                                                                           |
| **The admin secret reaching the client.**                       | It is read only in server modules, never returned from a `load`, never put in a cookie, and never echoed back into the login form.                         |
| **The admin secret reaching the repo.**                         | It is a Worker secret, not a `vars` entry. Locally it comes from `.dev.vars`, which is gitignored; only `.dev.vars.example` is committed.                  |
| **Guessing the secret by timing.**                              | Constant-time comparison of fixed-length digests, in both the login check and the session signature check.                                                 |
| **Forged admin sessions.**                                      | The cookie carries an expiry plus an HMAC-SHA256 signature keyed by the secret. Editing the expiry invalidates the signature.                              |
| **Session cookie theft via JavaScript or cross-site requests.** | `httpOnly`, `secure`, `sameSite=strict`, and scoped to `/admin`.                                                                                           |
| **An unauthenticated request reaching an admin route.**         | Gated on the `/admin` path prefix in `src/hooks.server.ts`, ahead of any `load` or action, so a route added there later is protected by where it sits.     |
| **Stale sessions outliving a rotated secret.**                  | The secret is the HMAC key, so rotating it invalidates every outstanding session with no session store to clear.                                           |
| **Public exposure of stored emails.**                           | The public `load` returns only redacted addresses, so the full value never reaches the page payload.                                                       |
| **Admin edits bypassing validation.**                           | Admin create and update run the same validation as the public form.                                                                                        |

`style-src` keeps `'unsafe-inline'`, which SvelteKit needs for the critical CSS it inlines during server rendering. Scripts stay nonce-restricted.

### Not prevented

| Failure                                    | Why                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Determined spam or abuse.**              | No CAPTCHA, rate limiting, or moderation queue. Out of scope for a starter.                                                                                   |
| **Brute force against `/admin/login`.**    | The free plan has no Rate Limiting rules, and a Worker-side counter needs KV or Durable Objects. The mitigation is a long random secret, not a memorable one. |
| **Email harvesting by the admin account.** | Redaction is a display choice on the public page. The full addresses are in D1 and on `/admin`, so anyone with the secret has all of them.                    |
| **Accountability for admin actions.**      | One shared account, no per-user identity, and no audit log, so an edit or a deletion cannot be attributed.                                                    |
| **Losing the secret.**                     | No recovery flow. Set a new one; there is nothing else to reset.                                                                                              |

## Developing

```bash
# Type check with svelte-check
npm run check

# Prettier check and ESLint
npm run lint

# Rewrite files with Prettier
npm run format

# Run the unit tests
npm test

# Run a single test file
npx vitest run src/lib/paginate.test.ts

# Build the Worker to .svelte-kit/cloudflare/
npm run build

# Build, then serve it through wrangler dev
npm run preview

# Remove build and Wrangler state
npm run clean
```

Check, lint, test, and build are what CI runs, over the whole repository rather than the lines a change touched.

The suite is unit tests only: the pure functions in `validation.ts`, `paginate.ts`, and `redact.ts`, plus the Web Crypto session code in `server/auth.ts`. The route handlers, the `/admin` gate, and the D1 queries are checked by hand against a dev server.

## Extensions

A custom domain, multi-user auth with an audit log, a moderation queue, keyset pagination and search on the admin table, and pagination on the public page.

## License

MIT
