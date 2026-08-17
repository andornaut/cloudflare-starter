export interface Pagination {
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * The row the page starts at. Its own function because the listing query needs
 * it before the total that paginate() reads: both run in one D1 batch.
 *
 * A page past the last one is not clamped: it yields an offset past the end, so
 * a stale bookmark renders an empty table that shows what is wrong instead of
 * quietly landing somewhere else.
 */
export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * The rest of the admin table's page arithmetic, kept out of the route so
 * off-by-one errors are caught by unit tests instead of by clicking.
 *
 * pageCount is at least 1, so an empty table reads "Page 1 of 1" rather than
 * "of 0". A page past the last one reports hasNext false, matching the offset
 * pageOffset leaves past the end.
 */
export function paginate(
  total: number,
  page: number,
  pageSize: number,
): Pagination {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    hasNext: page < pageCount,
    hasPrev: page > 1,
    pageCount,
  };
}
