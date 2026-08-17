import { fail, redirect } from "@sveltejs/kit";

import { signSession, verifySecret } from "$lib/server/auth";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
} from "$lib/server/session";

import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ cookies, platform, request }) => {
    const secret = platform?.env?.ADMIN_SECRET ?? "";
    if (!secret) {
      // Fail loudly rather than authenticating anyone against an unset secret.
      return fail(500, {
        error: "ADMIN_SECRET is not configured on this deployment",
      });
    }

    const form = await request.formData();
    const submitted = String(form.get("secret") ?? "");
    // No detail about which part was wrong, and the submitted value is never
    // echoed back into the form.
    if (!(await verifySecret(secret, submitted))) {
      return fail(400, { error: "Invalid secret" });
    }

    const expiresAt = Date.now() + SESSION_TTL_MS;
    cookies.set(
      SESSION_COOKIE,
      await signSession(secret, expiresAt),
      SESSION_COOKIE_OPTIONS,
    );
    redirect(303, "/admin");
  },
};
