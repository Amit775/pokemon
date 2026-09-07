/**
 * @jest-environment node
 */
import { hasuraDialect } from '../core/dialect/hasura-dialect';
import { readResources, type QueryRootField } from '../core/metadata/read-resources';

const endpoint = process.env['QUERY_BUILDER_ENDPOINT'];
const describeEndpoint = endpoint ? describe : describe.skip;

const introspectQueryRootQuery = `query IntrospectQueryRoot {
	__type(name: "query_root") {
		fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } }
	}
}`;

async function fetchQueryRootFields(): Promise<readonly QueryRootField[]> {
	const response = await fetch(endpoint as string, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: introspectQueryRootQuery, variables: {} }),
	});
	const payload = await response.json();
	if (payload.errors) throw new Error(JSON.stringify(payload.errors, null, 2));
	return payload.data.__type.fields;
}

describeEndpoint('resource discovery against a live endpoint', () => {
	it(
		'discovers the 160 filterable resources',
		async () => {
			const queryRootFields = await fetchQueryRootFields();
			const resources = readResources(queryRootFields, hasuraDialect);
			const resourceNames = resources.map((resource) => resource.resourceName);

			expect(resources.length).toBe(160);
			expect(resourceNames).toContain('pokemon');
			expect(resourceNames).toContain('pokemonstat');
			expect(resourceNames).toContain('move');
			expect(resourceNames).toContain('ability');
		},
		30000,
	);
});
