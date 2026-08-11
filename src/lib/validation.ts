export const MESSAGE_MAX_LENGTH = 1000;
export const EMAIL_MAX_LENGTH = 254;

/** Pragmatic format check, not RFC 5322: no spaces, one '@', a dotted domain. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Control characters other than newline. Tab and \r are rejected too. */
// eslint-disable-next-line no-control-regex
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f]/;

export interface GuestbookInput {
	email: string;
	message: string;
}

export type FieldErrors = Partial<Record<keyof GuestbookInput, string>>;

export interface ValidationResult {
	values: GuestbookInput;
	errors: FieldErrors;
	valid: boolean;
}

/**
 * Validates a guestbook submission. Shared by the public form and the admin
 * create/update actions, so an admin edit cannot store what a public submission
 * could not.
 *
 * XSS payloads pass validation untouched: escaping is output's job, and storing
 * the raw input keeps the record faithful. See src/routes/+page.svelte, where
 * Svelte escapes it on render.
 */
export function validateEntry(email: unknown, message: unknown): ValidationResult {
	const values = {
		email: typeof email === 'string' ? email.trim() : '',
		message: typeof message === 'string' ? message.trim() : ''
	};
	const errors: FieldErrors = {};

	if (!values.email) {
		errors.email = 'Email is required';
	} else if (values.email.length > EMAIL_MAX_LENGTH) {
		errors.email = `Email must be ${EMAIL_MAX_LENGTH} characters or fewer`;
	} else if (!EMAIL_PATTERN.test(values.email)) {
		errors.email = 'Email is not a valid address';
	}

	if (!values.message) {
		errors.message = 'Message is required';
	} else if (values.message.length > MESSAGE_MAX_LENGTH) {
		errors.message = `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer`;
	} else if (DISALLOWED_CONTROL_CHARS.test(values.message)) {
		errors.message = 'Message contains control characters';
	}

	return { values, errors, valid: Object.keys(errors).length === 0 };
}

/**
 * Parses a row id or a page number. Returns null for anything that is not a
 * positive integer, so the caller fails loudly rather than falling back.
 */
export function parsePositiveInt(value: unknown): number | null {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) {
		return null;
	}
	const parsed = Number(value);
	return parsed >= 1 && Number.isSafeInteger(parsed) ? parsed : null;
}
