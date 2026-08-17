import { site } from "$lib/config";

export const SESSION_COOKIE = "admin_session";

/**
 * Scoped to /admin so the cookie is never attached to a public page request.
 * httpOnly keeps it out of JavaScript, secure keeps it off plain HTTP, and
 * sameSite strict keeps it off cross-site navigations.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: site.sessionTtlHours * 60 * 60,
  path: "/admin",
  sameSite: "strict",
  secure: true,
} as const;

export const SESSION_TTL_MS = site.sessionTtlHours * 60 * 60 * 1000;
