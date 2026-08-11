import { error, fail, redirect } from '@sveltejs/kit';
import { site } from '$lib/config';
import { paginate } from '$lib/paginate';
import { parsePositiveInt, validateEntry } from '$lib/validation';
import { addEntry, countEntries, deleteEntry, listEntries, updateEntry } from '$lib/server/db';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '$lib/server/session';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * A ?page value that is not a positive integer is a 400, not a silent fall back
 * to page 1. A well-formed page past the last one renders the empty table with
 * its "Page 7 of 3" state visible, so a stale bookmark shows what is wrong.
 */
function requirePage(url: URL): number {
	const raw = url.searchParams.get('page');
	if (raw === null) {
		return 1;
	}
	const page = parsePositiveInt(raw);
	if (page === null) {
		error(400, 'page must be a positive integer');
	}
	return page;
}

function requireDb(platform: App.Platform | undefined) {
	const db = platform?.env?.DB;
	if (!db) {
		error(503, 'The guestbook database is not configured.');
	}
	return db;
}

/** Mutating actions return to the page the row was edited on. */
function backToPage(form: FormData) {
	const page = parsePositiveInt(String(form.get('page') ?? '1')) ?? 1;
	redirect(303, `/admin?page=${page}`);
}

export const load: PageServerLoad = async ({ url, platform }) => {
	const page = requirePage(url);
	const db = platform?.env?.DB;
	if (!db) {
		return {
			databaseMissing: true,
			entries: [],
			page,
			pageCount: 1,
			total: 0,
			hasPrev: false,
			hasNext: false
		};
	}

	const total = await countEntries(db);
	const { offset, pageCount, hasPrev, hasNext } = paginate(total, page, site.adminPageSize);
	const entries = await listEntries(db, site.adminPageSize, offset);

	return { databaseMissing: false, entries, page, pageCount, total, hasPrev, hasNext };
};

async function upsert(event: RequestEvent, mode: 'create' | 'update') {
	const db = requireDb(event.platform);
	const form = await event.request.formData();

	let id: number | null = null;
	if (mode === 'update') {
		id = parsePositiveInt(String(form.get('id') ?? ''));
		if (id === null) {
			return fail(400, { error: 'id must be a positive integer' });
		}
	}

	// The same validation as the public form, so an admin edit cannot store what
	// a public submission could not.
	const { values, errors, valid } = validateEntry(form.get('email'), form.get('message'));
	if (!valid) {
		return fail(400, { values, errors, id });
	}

	if (mode === 'create') {
		await addEntry(db, values.email, values.message);
	} else {
		const matched = await updateEntry(db, id as number, values.email, values.message);
		if (!matched) {
			return fail(404, { error: `No entry with id ${id}` });
		}
	}

	backToPage(form);
}

export const actions: Actions = {
	create: (event) => upsert(event, 'create'),
	update: (event) => upsert(event, 'update'),

	delete: async (event) => {
		const db = requireDb(event.platform);
		const form = await event.request.formData();
		const id = parsePositiveInt(String(form.get('id') ?? ''));
		if (id === null) {
			return fail(400, { error: 'id must be a positive integer' });
		}
		if (!(await deleteEntry(db, id))) {
			return fail(404, { error: `No entry with id ${id}` });
		}
		backToPage(form);
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_OPTIONS.path });
		redirect(303, '/admin/login');
	}
};
