import { coerceToGraphQLType } from './literal-value';

describe('coerceToGraphQLType', () => {
	it('rounds a float average into an integer column', () => {
		expect(coerceToGraphQLType(72.4, 'Int')).toBe(72);
		expect(coerceToGraphQLType(72.6, 'Int')).toBe(73);
	});

	it('leaves a float alone for a float column', () => {
		expect(coerceToGraphQLType(72.4, 'Float')).toBe(72.4);
	});

	it('passes lists and nulls through untouched', () => {
		expect(coerceToGraphQLType(null, 'Int')).toBeNull();
		expect(coerceToGraphQLType(['a', 'b'], 'String')).toEqual(['a', 'b']);
	});
});
