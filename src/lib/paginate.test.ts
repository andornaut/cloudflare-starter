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
		expect(paginate(250, 1, 50)).toMatchObject({ hasPrev: false, hasNext: true });
		expect(paginate(250, 3, 50)).toMatchObject({ hasPrev: true, hasNext: true });
		expect(paginate(250, 5, 50)).toMatchObject({ hasPrev: true, hasNext: false });
	});

	it('does not add a phantom trailing page when the total divides evenly', () => {
		expect(paginate(100, 2, 50)).toMatchObject({ pageCount: 2, hasNext: false });
	});

	it('reports one page for an empty table', () => {
		expect(paginate(0, 1, 50)).toEqual({
			pageCount: 1,
			hasPrev: false,
			hasNext: false
		});
	});

	it('offers no next page past the last one', () => {
		expect(paginate(10, 7, 50)).toEqual({
			pageCount: 1,
			hasPrev: true,
			hasNext: false
		});
	});

	it('counts a partial final page', () => {
		expect(paginate(101, 3, 50)).toMatchObject({ pageCount: 3, hasNext: false });
	});
});
