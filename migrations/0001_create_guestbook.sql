-- CURRENT_TIMESTAMP is second-granular, so same-second inserts tie. Every list
-- query breaks the tie on id, which only advances.
CREATE TABLE IF NOT EXISTS guestbook_entries (
	id INTEGER PRIMARY KEY,
	email TEXT NOT NULL,
	message TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guestbook_entries_created_at
	ON guestbook_entries (created_at DESC, id DESC);
