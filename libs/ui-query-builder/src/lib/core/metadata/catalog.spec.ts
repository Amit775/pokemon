import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createQueryBuilderCatalog } from './catalog';
import type { IntrospectionInputObject, IntrospectionOutputObject } from './introspection-types';

function createStubFetcher() {
	const requestedTypeNames: string[] = [];
	const fetcher = async (typeName: string): Promise<IntrospectionInputObject | null> => {
		requestedTypeNames.push(typeName);
		return (fixture as unknown as Record<string, IntrospectionInputObject>)[typeName] ?? null;
	};
	return { fetcher, requestedTypeNames };
}

async function stubOutputFetcher(typeName: string): Promise<IntrospectionOutputObject | null> {
	return (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null;
}

describe('query builder catalog', () => {
	it('returns descriptors for a boolean expression type', async () => {
		const { fetcher } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect, stubOutputFetcher);

		const descriptors = await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(descriptors.some((descriptor) => descriptor.fieldName === 'pokemonstats')).toBe(true);
	});

	it('fetches each type at most once', async () => {
		const { fetcher, requestedTypeNames } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect, stubOutputFetcher);

		await catalog.readBooleanExpressionFields('pokemon_bool_exp');
		await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(requestedTypeNames).toEqual(['pokemon_bool_exp']);
	});

	it('shares one fetch across every field of the same comparison type', async () => {
		const { fetcher, requestedTypeNames } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect, stubOutputFetcher);

		await catalog.readOperatorsForComparisonType('Int_comparison_exp');
		await catalog.readOperatorsForComparisonType('Int_comparison_exp');

		expect(requestedTypeNames).toEqual(['Int_comparison_exp']);
	});

	it('returns an empty descriptor list for a type the endpoint does not know', async () => {
		const { fetcher } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect, stubOutputFetcher);

		await expect(catalog.readBooleanExpressionFields('nonexistent_bool_exp')).resolves.toEqual([]);
	});

	it('evicts a rejected fetch so a transient failure can be retried instead of poisoning the type forever', async () => {
		const requestedTypeNames: string[] = [];
		let callCount = 0;
		const fetcher = async (typeName: string): Promise<IntrospectionInputObject | null> => {
			requestedTypeNames.push(typeName);
			callCount += 1;
			if (callCount === 1) throw new Error('temporary outage');
			return (fixture as unknown as Record<string, IntrospectionInputObject>)[typeName] ?? null;
		};
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect, stubOutputFetcher);

		await expect(catalog.readBooleanExpressionFields('pokemon_bool_exp')).rejects.toThrow('temporary outage');

		const descriptors = await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(descriptors.some((descriptor) => descriptor.fieldName === 'pokemonstats')).toBe(true);
		expect(requestedTypeNames).toEqual(['pokemon_bool_exp', 'pokemon_bool_exp']);
	});

	it('reads output object fields for a type', async () => {
		const catalog = createQueryBuilderCatalog(
			async (typeName) => (fixture as unknown as Record<string, IntrospectionInputObject>)[typeName] ?? null,
			hasuraDialect,
			async (typeName) => (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null,
		);

		const fields = await catalog.readOutputObjectFields('pokemon');

		expect(fields.some((field) => field.fieldName === 'name' && field.kind === 'scalar')).toBe(true);
	});

	it('fetches an output type at most once', async () => {
		const requestedTypeNames: string[] = [];
		const catalog = createQueryBuilderCatalog(
			async () => null,
			hasuraDialect,
			async (typeName) => {
				requestedTypeNames.push(typeName);
				return (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null;
			},
		);

		await catalog.readOutputObjectFields('pokemon');
		await catalog.readOutputObjectFields('pokemon');

		expect(requestedTypeNames).toEqual(['pokemon']);
	});
});
