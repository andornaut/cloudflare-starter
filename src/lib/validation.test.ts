import { describe, expect, it } from 'vitest';
import {
	EMAIL_MAX_LENGTH,
	MESSAGE_MAX_LENGTH,
	parsePositiveInt,
	validateEntry
} from './validation';

describe('validateEntry', () => {
	it('accepts a well-formed submission and trims it', () => {
		const result = validateEntry('  alice@example.com  ', '  hello  ');
		expect(result.valid).toBe(true);
		expect(result.values).toEqual({ email: 'alice@example.com', message: 'hello' });
	});

	it('rejects malformed addresses', () => {
		for (const email of ['alice', 'alice@', '@example.com', 'a b@example.com', 'a@b']) {
			expect(validateEntry(email, 'hi').errors.email).toBeDefined();
		}
	});

	it('requires both fields', () => {
		expect(validateEntry('', 'hi').errors.email).toBe('Email is required');
		expect(validateEntry('a@example.com', '   ').errors.message).toBe('Message is required');
		expect(validateEntry(undefined, null).valid).toBe(false);
	});

	it('enforces length limits', () => {
		const longLocal = 'a'.repeat(EMAIL_MAX_LENGTH);
		expect(validateEntry(`${longLocal}@example.com`, 'hi').errors.email).toContain(
			String(EMAIL_MAX_LENGTH)
		);
		expect(validateEntry('a@example.com', 'x'.repeat(MESSAGE_MAX_LENGTH)).valid).toBe(true);
		expect(
			validateEntry('a@example.com', 'x'.repeat(MESSAGE_MAX_LENGTH + 1)).errors.message
		).toBeDefined();
	});

	// A NUL truncates the value at the storage layer, so a row would otherwise
	// hold something shorter than what passed validation.
	it('rejects control characters in an address', () => {
		for (const code of [0, 9, 0x1f, 0x7f]) {
			const email = `a${String.fromCharCode(code)}b@example.com`;
			expect(validateEntry(email, 'hi').errors.email).toBe('Email contains control characters');
		}
	});

	it('allows newlines but rejects other control characters', () => {
		expect(validateEntry('a@example.com', 'line one\nline two').valid).toBe(true);
		expect(validateEntry('a@example.com', 'null\u0000byte').errors.message).toBeDefined();
		expect(validateEntry('a@example.com', 'tab\tseparated').errors.message).toBeDefined();
		expect(validateEntry('a@example.com', 'cr\rreturn').errors.message).toBeDefined();
		expect(validateEntry('a@example.com', 'del\u007fchar').errors.message).toBeDefined();
	});

	// Escaping is output's job. Storing the payload verbatim keeps the record
	// faithful, and the home page renders it as inert text.
	it('passes XSS payloads through untouched', () => {
		const payload = '<script>alert(1)</script>';
		const result = validateEntry('a@example.com', payload);
		expect(result.valid).toBe(true);
		expect(result.values.message).toBe(payload);
	});
});

describe('parsePositiveInt', () => {
	it('accepts positive integers', () => {
		expect(parsePositiveInt('1')).toBe(1);
		expect(parsePositiveInt('42')).toBe(42);
	});

	it('rejects everything else', () => {
		for (const value of ['0', '-1', 'abc', '1.5', '', ' 1', '1e3', '0x10', null, 7]) {
			expect(parsePositiveInt(value)).toBeNull();
		}
	});

	it('rejects values past the safe integer range', () => {
		expect(parsePositiveInt('9007199254740993')).toBeNull();
	});
});
