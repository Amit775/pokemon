import { resolveOperatorLabel } from './operator-labels';

describe('resolveOperatorLabel', () => {
	it('gives the comparison operators human wording rather than the raw schema identifier', () => {
		expect(resolveOperatorLabel('_eq')).toBe('is');
		expect(resolveOperatorLabel('_gt')).toBe('is greater than');
		expect(resolveOperatorLabel('_ilike')).toBe('contains');
		expect(resolveOperatorLabel('_in')).toBe('is one of');
		expect(resolveOperatorLabel('_nin')).toBe('is none of');
	});

	it('falls back to the humanized raw name for an operator it has no wording for, so nothing renders blank', () => {
		expect(resolveOperatorLabel('_has_key_any')).toBe('Has Key Any');
	});

	it('never returns an empty label for a non-empty operator name', () => {
		expect(resolveOperatorLabel('_st_d_within')).not.toBe('');
	});
});
