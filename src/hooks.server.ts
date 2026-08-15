import { type Handle, redirect } from '@sveltejs/kit';

import { verifySession } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/session';

const LOGIN_ROUTE = '/admin/login';

/** For responses with no rendered page: no nonce and no inline style to allow. */
const FALLBACK_CSP = "default-src 'self'; frame-ancestors 'none'";

/**
 * One hook doing both jobs: gating /admin and setting security headers.
 *
 * The gate is on the path prefix rather than in each admin `load`, so a route
 * added under /admin later is protected by where it sits, and an
 * unauthenticated request never reaches an admin load or action. SvelteKit
 * strips the /__data.json suffix before `handle` runs, so the exact match on
 * the login route exempts that route's data request along with the page.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

	if (isAdminRoute && pathname !== LOGIN_ROUTE) {
		const secret = event.platform?.env?.ADMIN_SECRET ?? '';
		if (!(await verifySession(secret, event.cookies.get(SESSION_COOKIE)))) {
			redirect(303, LOGIN_ROUTE);
		}
	}

	const response = await resolve(event);

	// SvelteKit sets neither of these, so they go on everything resolve() returns.
	// The gate's 303 above is thrown past this point and stays bare, which costs
	// nothing: it carries a location and no body for these to constrain.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	// Defense in depth behind Svelte's output escaping, not a substitute for it.
	// Every rendered page, error pages included, already carries SvelteKit's own
	// policy (see svelte.config.js) with the nonce its hydration script needs, and
	// overwriting that would break hydration. What is left is an action's redirect.
	if (!response.headers.has('content-security-policy')) {
		response.headers.set('Content-Security-Policy', FALLBACK_CSP);
	}
	return response;
};
