/**
 * The single source for every non-secret value the app renders or queries with.
 * Nothing that appears in a page or a query hardcodes these anywhere else.
 *
 * Cloudflare platform config (worker name, compatibility date, D1 binding,
 * custom-domain route) lives in wrangler.jsonc, which Wrangler reads before the
 * app builds and cannot import TypeScript from. ADMIN_SECRET is a Worker secret,
 * because this file is committed.
 */
export const site = {
	name: 'cloudflare-starter',
	title: 'Hello, world - Cloudflare starter',
	description: 'A SvelteKit + Cloudflare Workers + D1 starter with a guestbook.',
	/** Canonical host, e.g. 'guestbook.example.com'. Empty derives it from the request. */
	domain: '',
	/** Rows the public page lists, and the number in its heading. */
	entryLimit: 20,
	/** Rows per page in the admin table. */
	adminPageSize: 50,
	/** Admin session lifetime, and the session cookie's max age. */
	sessionTtlHours: 12
} as const;
