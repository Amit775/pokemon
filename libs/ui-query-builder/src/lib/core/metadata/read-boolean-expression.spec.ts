import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { readBooleanExpression } from './read-boolean-expression';
import type { IntrospectionInputObject } from './introspection-types';

const pokemonBooleanExpression = fixture['pokemon_bool_exp'] as IntrospectionInputObject;

describe('readBooleanExpression', () => {
	const descriptors = readBooleanExpression(pokemonBooleanExpression, hasuraDialect);
	const byName = new Map(descriptors.map((descriptor) => [descriptor.fieldName, descriptor]));

	it('drops the structural combinator fields', () => {
		expect(byName.has('_and')).toBe(false);
		expect(byName.has('_or')).toBe(false);
		expect(byName.has('_not')).toBe(false);
	});

	it('classifies a comparison field as a scalar carrying its comparison type', () => {
		expect(byName.get('name')).toEqual({ kind: 'scalar', fieldName: 'name', comparisonTypeName: 'String_comparison_exp' });
		expect(byName.get('height')).toEqual({ kind: 'scalar', fieldName: 'height', comparisonTypeName: 'Int_comparison_exp' });
	});

	it('classifies a relation with an aggregate sibling as to-many', () => {
		expect(byName.get('pokemonstats')).toEqual({
			kind: 'relation',
			fieldName: 'pokemonstats',
			booleanExpressionTypeName: 'pokemonstat_bool_exp',
			cardinality: 'toMany',
		});
	});

	it('classifies a relation without an aggregate sibling as to-one', () => {
		expect(byName.get('pokemonspecy')).toEqual({
			kind: 'relation',
			fieldName: 'pokemonspecy',
			booleanExpressionTypeName: 'pokemonspecies_bool_exp',
			cardinality: 'toOne',
		});
	});

	it('keeps aggregate predicates as their own kind', () => {
		expect(byName.get('pokemonmoves_aggregate')).toEqual({
			kind: 'aggregatePredicate',
			fieldName: 'pokemonmoves_aggregate',
			booleanExpressionTypeName: 'pokemonmove_aggregate_bool_exp',
		});
	});
});
