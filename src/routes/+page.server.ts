import { fail } from '@sveltejs/kit';
import { site } from '$lib/config';
import { redactEmail } from '$lib/redact';
import { validateEntry, type FieldErrors, type GuestbookInput } from '$lib/validation';
import { addEntry, listEntries } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

interface FormPayload {
	values: GuestbookInput;
	errors: FieldErrors;
	formError?: string;
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return { entries: [], databaseMissing: true };
	}

	const entries = await listEntries(db, site.entryLimit);
	// Redacted here rather than in the template, so the full address never
	// reaches the serialized page payload.
	return {
		databaseMissing: false,
		entries: entries.map((entry) => ({
			id: entry.id,
			message: entry.message,
			emailMasked: redactEmail(entry.email),
			created_at: entry.created_at
		}))
	};
};

export const actions: Actions = {
	default: async ({ request, platform }) => {
		const form = await request.formData();

		// Honeypot: a browser leaves it empty. Report success and store nothing,
		// so a bot cannot tell it was caught.
		if (String(form.get('website') ?? '').trim() !== '') {
			return { success: true };
		}

		const { values, errors, valid } = validateEntry(form.get('email'), form.get('message'));
		const payload: FormPayload = { values, errors };
		if (!valid) {
			return fail(400, payload);
		}

		const db = platform?.env?.DB;
		if (!db) {
			payload.formError = 'The guestbook database is not configured.';
			return fail(503, payload);
		}

		await addEntry(db, values.email, values.message);
		return { success: true };
	}
};
