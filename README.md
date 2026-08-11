# cloudflare-starter

A [SvelteKit](https://svelte.dev/docs/kit) starter that runs entirely on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with a [D1](https://developers.cloudflare.com/d1/) database: a hello-world home page with a guestbook, plus an admin view over the same entries.

| View   | Route    | Who                     | Can               | Sees                                       | Extent                 |
| ------ | -------- | ----------------------- | ----------------- | ------------------------------------------ | ---------------------- |
| Public | `/`      | anyone                  | add only          | message + redacted email (`a***@host.com`) | newest 20, no paging   |
| Admin  | `/admin` | the one `admin` account | add, edit, delete | message + full email                       | every entry, paginated |

## Requirements

- Node 22 (see `.nvmrc`)
- A free Cloudflare account

Every service this uses is on the free plan:

| Service                        | Free limit                                          | Guestbook usage  |
| ------------------------------ | --------------------------------------------------- | ---------------- |
| Workers                        | 100k requests/day, 10 ms CPU/request                | SSR + form posts |
| D1                             | 5 GB storage, 5M row reads/day, 100k row writes/day | One small table  |
| Static assets on Workers       | Free, unmetered                                     | JS/CSS bundles   |
| `<name>.workers.dev` subdomain | Free                                                | No custom domain |

## Usage

```bash
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

`src/lib/config.ts` is the one place for site metadata: title, description, canonical domain, the public entry limit, the admin page size, and the session TTL. The rendered text and the query limit it describes read the same field, so they cannot drift.

`wrangler.jsonc` holds Cloudflare platform config (Worker name, compatibility date, the `DB` binding). Secrets are in neither file.

## Admin access

The account is `admin` and the secret is whatever `ADMIN_SECRET` holds. Generate a long random value and keep it in a password manager:

```bash
openssl rand -base64 32
```

Rotate it with `npx wrangler secret put ADMIN_SECRET`, which signs out every open session, since the secret is also the key the session cookie is signed with. Never commit it, and never put it in `wrangler.jsonc`, which is committed.

## Developing

| Script            | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Vite dev server with a local D1 database       |
| `npm run build`   | Builds the Worker to `.svelte-kit/cloudflare/` |
| `npm run preview` | Builds, then serves it through `wrangler dev`  |
| `npm run check`   | `svelte-check` type checking                   |
| `npm run lint`    | Prettier check and ESLint                      |
| `npm run format`  | Rewrites files with Prettier                   |
| `npm test`        | Vitest unit suite                              |
| `npm run migrate` | Applies `migrations/` to the local D1 database |
| `npm run deploy`  | Builds and deploys with Wrangler               |
| `npm run clean`   | Removes build and Wrangler state               |

Run one test file with `npx vitest run src/lib/paginate.test.ts`.

The suite is unit tests only: the pure functions (`validation.ts`, `paginate.ts`, `redact.ts`) and the Web Crypto session code (`server/auth.ts`). The route handlers, the `/admin` gate, and the D1 queries are covered by the manual verification pass in `plan.md`, not by an automated suite.

## Security

Prevented:

- **Stored XSS** by output encoding: Svelte escapes `{...}` expressions, and user content never goes through `{@html}`. Input is stored raw and escaped on render.
- **SQL injection** by prepared statements with `.bind()` everywhere, including `LIMIT` and `OFFSET`.
- **Client-side validation bypass** by validating every submission on the server, with the same rules for the public form and admin edits.
- **CSRF** by SvelteKit's origin check on form actions.
- **Inline-script injection surviving a template mistake** by `Content-Security-Policy: default-src 'self'`, with SvelteKit adding a per-response nonce to `script-src` so only its own hydration script runs. `style-src` keeps `'unsafe-inline'`, which SvelteKit needs for the critical CSS it inlines during SSR.
- **Trivial spam bots** by a honeypot field.
- **The admin secret leaking** to the client (it is read only in server modules, never returned from a `load`, never echoed into the form) or through the repo (it is a Worker secret, and `.dev.vars` is gitignored).
- **Guessing the secret by timing** with constant-time comparison in both the login check and the session HMAC check.
- **Forged or stolen admin sessions** with an HMAC-SHA256 signed expiry, and a cookie that is `httpOnly`, `secure`, `sameSite=strict`, and scoped to `/admin`.
- **Unauthenticated requests reaching an admin route** by gating on the `/admin` path prefix in `src/hooks.server.ts`, ahead of any `load` or action.
- **Public exposure of stored emails** by redacting in the `load`, so the full address never reaches the page payload.

Not prevented, and the first things to add:

- **Determined spam or abuse.** No CAPTCHA, rate limiting, or moderation queue.
- **Brute force against `/admin/login`.** The free plan has no Rate Limiting rules and a Worker-side counter needs KV or Durable Objects. The mitigation is a long random secret, not a memorable one.
- **Email harvesting by the admin account.** Redaction is a display choice on the public page; anyone with the secret has every address.
- **Accountability for admin actions.** One shared account, no per-user identity and no audit log.
- **Losing the secret.** There is no recovery flow; set a new one.

## Extensions

Custom domain, multi-user auth with an audit log, a moderation queue, keyset pagination and search on the admin table, and pagination on the public page.

## License

[MIT](./LICENSE)
