import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createQueryBuilderCatalog } from './catalog';
import type { IntrospectionInputObject } from './introspection-types';

function createStubFetcher() {
	const requestedTypeNames: string[] = [];
	const fetcher = async (typeName: string): Promise<IntrospectionInputObject | null> => {
		requestedTypeNames.push(typeName);
		return (fixture as Record<string, IntrospectionInputObject>)[typeName] ?? null;
	};
	return { fetcher, requestedTypeNames };
}

describe('query builder catalog', () => {
	it('returns descriptors for a boolean expression type', async () => {
		const { fetcher } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		const descriptors = await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(descriptors.some((descriptor) => descriptor.fieldName === 'pokemonstats')).toBe(true);
	});

	it('fetches each type at most once', async () => {
		const { fetcher, requestedTypeNames } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		await catalog.readBooleanExpressionFields('pokemon_bool_exp');
		await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(requestedTypeNames).toEqual(['pokemon_bool_exp']);
	});

	it('shares one fetch across every field of the same comparison type', async () => {
		const { fetcher, requestedTypeNames } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		await catalog.readOperatorsForComparisonType('Int_comparison_exp');
		await catalog.readOperatorsForComparisonType('Int_comparison_exp');

		expect(requestedTypeNames).toEqual(['Int_comparison_exp']);
	});

	it('returns an empty descriptor list for a type the endpoint does not know', async () => {
		const { fetcher } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		await expect(catalog.readBooleanExpressionFields('nonexistent_bool_exp')).resolves.toEqual([]);
	});
});
