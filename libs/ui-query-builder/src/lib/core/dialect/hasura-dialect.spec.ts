import { hasuraDialect } from './hasura-dialect';

describe('hasura dialect', () => {
	it('recognises the structural combinator fields', () => {
		expect(hasuraDialect.structuralFieldNames.has('_and')).toBe(true);
		expect(hasuraDialect.structuralFieldNames.has('_or')).toBe(true);
		expect(hasuraDialect.structuralFieldNames.has('_not')).toBe(true);
		expect(hasuraDialect.structuralFieldNames.has('name')).toBe(false);
	});

	it('recognises comparison expression type names', () => {
		expect(hasuraDialect.isComparisonTypeName('Int_comparison_exp')).toBe(true);
		expect(hasuraDialect.isComparisonTypeName('String_comparison_exp')).toBe(true);
		expect(hasuraDialect.isComparisonTypeName('pokemon_bool_exp')).toBe(false);
	});

	it('separates plain boolean expressions from aggregate ones', () => {
		expect(hasuraDialect.isBooleanExpressionTypeName('pokemon_bool_exp')).toBe(true);
		expect(hasuraDialect.isAggregateBooleanExpressionTypeName('pokemonmove_aggregate_bool_exp')).toBe(true);
		expect(hasuraDialect.isAggregateBooleanExpressionTypeName('pokemon_bool_exp')).toBe(false);
	});

	it('derives the aggregate sibling name used for the cardinality test', () => {
		expect(hasuraDialect.aggregateSiblingFieldName('pokemonstats')).toBe('pokemonstats_aggregate');
	});

	it('derives aggregate field type names for a resource', () => {
		expect(hasuraDialect.aggregateFieldsTypeName('pokemonstat', 'avg')).toBe('pokemonstat_avg_fields');
		expect(hasuraDialect.aggregateFieldsTypeName('pokemonstat', 'max')).toBe('pokemonstat_max_fields');
	});
});
