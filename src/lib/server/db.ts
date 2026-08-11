import type { D1Database } from '@cloudflare/workers-types';

export interface GuestbookEntry {
	id: number;
	email: string;
	message: string;
	created_at: string;
}

/**
 * Every statement is prepared and bound, so no user value reaches the SQL
 * string. LIMIT and OFFSET are bound parameters too.
 *
 * `id DESC` is not decoration: created_at is second-granular, and without a
 * unique tiebreak SQLite may order same-second rows differently between two
 * queries, which on an offset scan drops or repeats a row at a page boundary.
 */
const LIST_SQL =
	'SELECT id, email, message, created_at FROM guestbook_entries ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';

const COUNT_SQL = 'SELECT COUNT(*) AS n FROM guestbook_entries';

export async function listEntries(
	db: D1Database,
	limit: number,
	offset = 0
): Promise<GuestbookEntry[]> {
	const { results } = await db.prepare(LIST_SQL).bind(limit, offset).all<GuestbookEntry>();
	return results ?? [];
}

export interface EntryPage {
	entries: GuestbookEntry[];
	total: number;
}

/**
 * The rows on a page and the total, in one batch that D1 sends as a single
 * round trip. The offset is the caller's, because the total that decides the
 * page count arrives with the rows rather than ahead of them.
 *
 * batch() types every statement in it the same, so each result is cast where it
 * is read.
 */
export async function listPage(db: D1Database, limit: number, offset: number): Promise<EntryPage> {
	const [page, count] = await db.batch([
		db.prepare(LIST_SQL).bind(limit, offset),
		db.prepare(COUNT_SQL)
	]);
	return {
		entries: page.results as GuestbookEntry[],
		total: (count.results[0] as { n: number } | undefined)?.n ?? 0
	};
}

export async function addEntry(db: D1Database, email: string, message: string): Promise<void> {
	await db
		.prepare('INSERT INTO guestbook_entries (email, message) VALUES (?, ?)')
		.bind(email, message)
		.run();
}

/**
 * Rewrites email and message only. id and created_at are left alone, so editing
 * an entry does not move it in the list. Returns whether a row matched.
 */
export async function updateEntry(
	db: D1Database,
	id: number,
	email: string,
	message: string
): Promise<boolean> {
	const result = await db
		.prepare('UPDATE guestbook_entries SET email = ?, message = ? WHERE id = ?')
		.bind(email, message, id)
		.run();
	return (result.meta?.changes ?? 0) > 0;
}

/** Returns whether a row matched, so deleting a deleted id reports "not found". */
export async function deleteEntry(db: D1Database, id: number): Promise<boolean> {
	const result = await db.prepare('DELETE FROM guestbook_entries WHERE id = ?').bind(id).run();
	return (result.meta?.changes ?? 0) > 0;
}
