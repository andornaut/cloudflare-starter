/**
 * Admin authentication, on Web Crypto only. No dependencies, and everything
 * here runs unchanged on Workers and in Node 22 (which is what the unit tests
 * exercise).
 *
 * ADMIN_SECRET is both the login secret and the HMAC key for the session
 * cookie, so rotating it invalidates every outstanding session with no session
 * store to clear.
 */
const encoder = new TextEncoder();

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

/**
 * Constant-time secret check. Comparing fixed-length digests rather than the
 * raw strings means a wrong secret costs the same time whatever its prefix, and
 * length alone leaks nothing.
 *
 * An unset secret authenticates nobody, so a missing binding cannot compare
 * equal to an empty submission.
 */
export async function verifySecret(
  expected: string,
  submitted: string,
): Promise<boolean> {
  if (!expected) {
    return false;
  }
  const [expectedDigest, submittedDigest] = await Promise.all([
    digest(expected),
    digest(submitted),
  ]);
  return timingSafeEqual(expectedDigest, submittedDigest);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function hmac(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );
}

/**
 * Session cookie value: `<expiresAt>.<base64url HMAC-SHA256 of expiresAt>`.
 * The secret is the key and never appears in the cookie.
 */
export async function signSession(
  secret: string,
  expiresAt: number,
): Promise<string> {
  return `${expiresAt}.${base64url(await hmac(secret, String(expiresAt)))}`;
}

/**
 * Recomputes the signature and compares it in constant time, then rejects an
 * expired expiry. `now` is a parameter so tests need no clock control.
 */
export async function verifySession(
  secret: string,
  cookie: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!secret || !cookie) {
    return false;
  }
  const separator = cookie.indexOf(".");
  if (separator < 1) {
    return false;
  }
  const expiresRaw = cookie.slice(0, separator);
  if (!/^\d+$/.test(expiresRaw)) {
    return false;
  }
  const expiresAt = Number(expiresRaw);
  const expected = await signSession(secret, expiresAt);
  if (!timingSafeEqual(encoder.encode(expected), encoder.encode(cookie))) {
    return false;
  }
  return expiresAt > now;
}
