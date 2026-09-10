import { hasuraDialect } from '../dialect/hasura-dialect';
import { readResources, type QueryRootField } from './read-resources';

const queryRootFields: QueryRootField[] = [
	{ name: 'pokemon', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'pokemon_bool_exp' } }, { name: 'limit', type: { kind: 'SCALAR', name: 'Int' } }] },
	{ name: 'pokemon_aggregate', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'pokemon_bool_exp' } }] },
	{ name: 'pokemon_by_pk', args: [{ name: 'id', type: { kind: 'SCALAR', name: 'Int' } }] },
	{ name: 'languages', args: [] },
];

describe('readResources', () => {
	it('keeps only fields that accept a where argument', () => {
		const resources = readResources(queryRootFields, hasuraDialect);

		expect(resources.map((resource) => resource.resourceName)).not.toContain('languages');
		expect(resources.map((resource) => resource.resourceName)).not.toContain('pokemon_by_pk');
	});

	it('excludes the aggregate variants, which are not leading resources', () => {
		const resources = readResources(queryRootFields, hasuraDialect);

		expect(resources.map((resource) => resource.resourceName)).toEqual(['pokemon']);
	});

	it('records the boolean expression type each resource filters through', () => {
		const resources = readResources(queryRootFields, hasuraDialect);

		expect(resources[0]).toEqual({ resourceName: 'pokemon', booleanExpressionTypeName: 'pokemon_bool_exp' });
	});
});
