import { redirect, type Handle } from '@sveltejs/kit';
import { verifySession } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/session';

const LOGIN_ROUTE = '/admin/login';

/**
 * One hook doing both jobs: gating /admin and setting the CSP header.
 *
 * The gate is on the path prefix rather than in each admin `load`, so a route
 * added under /admin later is protected by where it sits, and an
 * unauthenticated request never reaches an admin load or action.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

	event.locals.isAdmin = false;
	if (isAdminRoute && pathname !== LOGIN_ROUTE) {
		const secret = event.platform?.env?.ADMIN_SECRET ?? '';
		const authenticated = await verifySession(secret, event.cookies.get(SESSION_COOKIE));
		if (!authenticated) {
			redirect(303, LOGIN_ROUTE);
		}
		event.locals.isAdmin = true;
	}

	const response = await resolve(event);
	// Defense in depth behind Svelte's output escaping, not a substitute for it.
	// Rendered pages already carry SvelteKit's own policy (see svelte.config.js),
	// which includes a nonce for its hydration script; overwriting it here would
	// break hydration. This covers redirects and error responses.
	if (!response.headers.has('content-security-policy')) {
		response.headers.set('Content-Security-Policy', "default-src 'self'");
	}
	return response;
};
