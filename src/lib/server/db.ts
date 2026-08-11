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

export async function listEntries(
	db: D1Database,
	limit: number,
	offset = 0
): Promise<GuestbookEntry[]> {
	const { results } = await db.prepare(LIST_SQL).bind(limit, offset).all<GuestbookEntry>();
	return results ?? [];
}

export async function countEntries(db: D1Database): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM guestbook_entries')
		.first<{ n: number }>();
	return row?.n ?? 0;
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
