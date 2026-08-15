import { describe, expect, it } from 'vitest';

import { pageOffset, paginate } from './paginate';

describe('pageOffset', () => {
	it('offsets the first, middle, and last page', () => {
		expect(pageOffset(1, 50)).toBe(0);
		expect(pageOffset(3, 50)).toBe(100);
		expect(pageOffset(5, 50)).toBe(200);
	});

	it('leaves a page past the last one past the end', () => {
		expect(pageOffset(7, 50)).toBe(300);
	});
});

describe('paginate', () => {
	it('reports both ends', () => {
		expect(paginate(250, 1, 50)).toMatchObject({ hasNext: true, hasPrev: false });
		expect(paginate(250, 3, 50)).toMatchObject({ hasNext: true, hasPrev: true });
		expect(paginate(250, 5, 50)).toMatchObject({ hasNext: false, hasPrev: true });
	});

	it('does not add a phantom trailing page when the total divides evenly', () => {
		expect(paginate(100, 2, 50)).toMatchObject({ hasNext: false, pageCount: 2 });
	});

	it('reports one page for an empty table', () => {
		expect(paginate(0, 1, 50)).toEqual({
			hasNext: false,
			hasPrev: false,
			pageCount: 1
		});
	});

	it('offers no next page past the last one', () => {
		expect(paginate(10, 7, 50)).toEqual({
			hasNext: false,
			hasPrev: true,
			pageCount: 1
		});
	});

	it('counts a partial final page', () => {
		expect(paginate(101, 3, 50)).toMatchObject({ hasNext: false, pageCount: 3 });
	});
});
