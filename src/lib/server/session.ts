import { site } from '$lib/config';

export const SESSION_COOKIE = 'admin_session';

/**
 * Scoped to /admin so the cookie is never attached to a public page request.
 * httpOnly keeps it out of JavaScript, secure keeps it off plain HTTP, and
 * sameSite strict keeps it off cross-site navigations.
 */
export const SESSION_COOKIE_OPTIONS = {
	path: '/admin',
	httpOnly: true,
	secure: true,
	sameSite: 'strict',
	maxAge: site.sessionTtlHours * 60 * 60
} as const;

export const SESSION_TTL_MS = site.sessionTtlHours * 60 * 60 * 1000;
