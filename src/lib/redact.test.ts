import { describe, expect, it } from 'vitest';
import { redactEmail } from './redact';

describe('redactEmail', () => {
	it('masks a normal address to one character plus the domain', () => {
		expect(redactEmail('alice@example.com')).toBe('a***@example.com');
	});

	it('leaks nothing of a one-character local part', () => {
		expect(redactEmail('a@example.com')).toBe('***@example.com');
	});

	it('keeps the domain', () => {
		expect(redactEmail('bob@mail.example.co.uk')).toBe('b***@mail.example.co.uk');
	});

	it('does not contain the original address', () => {
		const email = 'someone.long@example.com';
		expect(redactEmail(email)).not.toContain('someone.long');
	});

	it('masks a value with no @ entirely', () => {
		expect(redactEmail('not-an-address')).toBe('***');
		expect(redactEmail('@example.com')).toBe('***');
		expect(redactEmail('')).toBe('***');
	});

	it('splits on the last @', () => {
		expect(redactEmail('weird@local@example.com')).toBe('w***@example.com');
	});
});
