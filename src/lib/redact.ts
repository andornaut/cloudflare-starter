/**
 * Masks an address for public display: alice@example.com -> a***@example.com.
 *
 * A one-character local part masks to ***@example.com rather than leaking the
 * whole of it. A value with no '@' is masked entirely, so a malformed row can
 * never render in full.
 */
export function redactEmail(email: string): string {
	const at = email.lastIndexOf('@');
	if (at < 1) {
		return '***';
	}
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	const prefix = local.length > 1 ? local[0] : '';
	return `${prefix}***@${domain}`;
}
