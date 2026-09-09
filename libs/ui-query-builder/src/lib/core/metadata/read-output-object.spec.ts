import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { readOutputObject } from './read-output-object';
import type { IntrospectionOutputObject } from './introspection-types';

const pokemonOutputObject = fixture['pokemon'] as unknown as IntrospectionOutputObject;

describe('readOutputObject', () => {
	const descriptors = readOutputObject(pokemonOutputObject);
	const byName = new Map(descriptors.map((descriptor) => [descriptor.fieldName, descriptor]));

	it('classifies a scalar column with its scalar type', () => {
		expect(byName.get('base_experience')).toEqual({ kind: 'scalar', fieldName: 'base_experience', scalarTypeName: 'Int' });
		expect(byName.get('name')).toEqual({ kind: 'scalar', fieldName: 'name', scalarTypeName: 'String' });
	});

	it('classifies a to-many relation as a list', () => {
		expect(byName.get('pokemonstats')).toEqual({ kind: 'relation', fieldName: 'pokemonstats', objectTypeName: 'pokemonstat', isList: true });
	});

	it('classifies a to-one relation as not a list', () => {
		expect(byName.get('pokemonspecy')).toEqual({ kind: 'relation', fieldName: 'pokemonspecy', objectTypeName: 'pokemonspecies', isList: false });
	});

	it('drops the aggregate companions, which are not selectable fields', () => {
		expect([...byName.keys()].some((fieldName) => fieldName.endsWith('_aggregate'))).toBe(false);
	});
});
