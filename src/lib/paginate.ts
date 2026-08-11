export interface Pagination {
	offset: number;
	pageCount: number;
	hasPrev: boolean;
	hasNext: boolean;
}

/**
 * All of the admin table's page arithmetic, kept out of the route so off-by-one
 * errors are caught by unit tests instead of by clicking.
 *
 * pageCount is at least 1, so an empty table reads "Page 1 of 1" rather than
 * "of 0". A page past the last one is not clamped: it yields an offset past the
 * end and hasNext false, so a stale bookmark renders an empty table that shows
 * what is wrong instead of quietly landing somewhere else.
 */
export function paginate(total: number, page: number, pageSize: number): Pagination {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	return {
		offset: (page - 1) * pageSize,
		pageCount,
		hasPrev: page > 1,
		hasNext: page < pageCount
	};
}
