import { describe, expect, it } from 'vitest';

import { signSession, verifySecret, verifySession } from './auth';

const SECRET = 'correct-horse-battery-staple';
const HOUR_MS = 60 * 60 * 1000;

describe('verifySecret', () => {
	it('accepts the exact secret', async () => {
		expect(await verifySecret(SECRET, SECRET)).toBe(true);
	});

	it('rejects a wrong secret, a prefix, an empty string, and a longer value', async () => {
		expect(await verifySecret(SECRET, 'wrong')).toBe(false);
		expect(await verifySecret(SECRET, SECRET.slice(0, -1))).toBe(false);
		expect(await verifySecret(SECRET, '')).toBe(false);
		expect(await verifySecret(SECRET, `${SECRET}x`)).toBe(false);
	});

	it('authenticates nobody when the secret is unset', async () => {
		expect(await verifySecret('', '')).toBe(false);
		expect(await verifySecret('', 'anything')).toBe(false);
	});
});

describe('verifySession', () => {
	const now = 1_700_000_000_000;
	const expiresAt = now + 12 * HOUR_MS;

	it('accepts what signSession produced', async () => {
		const cookie = await signSession(SECRET, expiresAt);
		expect(await verifySession(SECRET, cookie, now)).toBe(true);
	});

	it('never puts the secret in the cookie', async () => {
		const cookie = await signSession(SECRET, expiresAt);
		expect(cookie).not.toContain(SECRET);
		expect(cookie.startsWith(`${expiresAt}.`)).toBe(true);
	});

	it('rejects a tampered expiry', async () => {
		const cookie = await signSession(SECRET, expiresAt);
		const [, signature] = cookie.split('.');
		expect(await verifySession(SECRET, `${expiresAt + HOUR_MS}.${signature}`, now)).toBe(false);
	});

	it('rejects a tampered signature', async () => {
		const cookie = await signSession(SECRET, expiresAt);
		const flipped = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
		expect(await verifySession(SECRET, flipped, now)).toBe(false);
	});

	it('rejects a value signed with a different secret', async () => {
		const cookie = await signSession('another-secret', expiresAt);
		expect(await verifySession(SECRET, cookie, now)).toBe(false);
	});

	it('rejects a correctly signed but expired token', async () => {
		const cookie = await signSession(SECRET, now - 1);
		expect(await verifySession(SECRET, cookie, now)).toBe(false);
	});

	it('rejects a missing or malformed cookie', async () => {
		expect(await verifySession(SECRET, undefined, now)).toBe(false);
		expect(await verifySession(SECRET, '', now)).toBe(false);
		expect(await verifySession(SECRET, 'nodot', now)).toBe(false);
		expect(await verifySession(SECRET, '.signature', now)).toBe(false);
		expect(await verifySession(SECRET, 'notanumber.signature', now)).toBe(false);
	});

	// A missing ADMIN_SECRET binding authenticates nobody. verifySession returns
	// before it would reach the HMAC, which rejects a zero-length key anyway.
	it('rejects every cookie when the secret is unset', async () => {
		const cookie = await signSession(SECRET, expiresAt);
		expect(await verifySession('', cookie, now)).toBe(false);
	});
});
