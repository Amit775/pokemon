import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { readOperators } from './read-operators';
import type { IntrospectionInputObject } from './introspection-types';

describe('readOperators', () => {
	it('reads the nine integer operators with their argument shapes', () => {
		const operators = readOperators(fixture['Int_comparison_exp'] as IntrospectionInputObject);
		const names = operators.map((operator) => operator.operatorName);

		expect(names).toEqual(['_eq', '_gt', '_gte', '_in', '_is_null', '_lt', '_lte', '_neq', '_nin']);
		expect(operators.find((operator) => operator.operatorName === '_in')?.acceptsList).toBe(true);
		expect(operators.find((operator) => operator.operatorName === '_eq')?.acceptsList).toBe(false);
		expect(operators.find((operator) => operator.operatorName === '_eq')?.argumentTypeName).toBe('Int');
		expect(operators.find((operator) => operator.operatorName === '_is_null')?.argumentTypeName).toBe('Boolean');
	});

	it('reads the larger string operator set including pattern matching', () => {
		const operators = readOperators(fixture['String_comparison_exp'] as IntrospectionInputObject);
		const names = operators.map((operator) => operator.operatorName);

		expect(names).toHaveLength(19);
		expect(names).toContain('_ilike');
		expect(names).toContain('_regex');
	});
});
