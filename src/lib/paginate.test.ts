import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

describe('paginate', () => {
	it('offsets the first, middle, and last page', () => {
		expect(paginate(250, 1, 50).offset).toBe(0);
		expect(paginate(250, 3, 50).offset).toBe(100);
		expect(paginate(250, 5, 50).offset).toBe(200);
	});

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
			offset: 0,
			pageCount: 1,
			hasPrev: false,
			hasNext: false
		});
	});

	it('leaves a page past the last one past the end', () => {
		const result = paginate(10, 7, 50);
		expect(result.pageCount).toBe(1);
		expect(result.offset).toBe(300);
		expect(result.hasNext).toBe(false);
		expect(result.hasPrev).toBe(true);
	});

	it('counts a partial final page', () => {
		expect(paginate(101, 3, 50)).toMatchObject({ pageCount: 3, offset: 100, hasNext: false });
	});
});
