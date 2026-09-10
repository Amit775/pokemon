import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { QUERY_BUILDER_ENDPOINT, QueryBuilderComponent, QueryBuilderStore, createFilterGroup } from '@pokemon-center/ui-query-builder';
import { registerDataGridModules } from '@pokemon-center/ui-pokedex';
import { QueryExplorerComponent } from './query-explorer.component';

const endpointUrl = '/api/query-builder/graphql';

const introspectionOperationNamePattern = /\bquery\s+Introspect\w*/;

function isIntrospectionRequest(body: unknown): boolean {
	const query = (body as { query?: unknown } | null)?.query;
	return typeof query === 'string' && introspectionOperationNamePattern.test(query);
}

describe('the spec helper that separates introspection reads from data requests', () => {
	it('recognises every introspection query the query builder can issue', () => {
		expect(isIntrospectionRequest({ query: 'query IntrospectType($typeName: String!) { __type(name: $typeName) { name } }' })).toBe(true);
		expect(isIntrospectionRequest({ query: 'query IntrospectOutputType($typeName: String!) { __type(name: $typeName) { name } }' })).toBe(true);
		expect(isIntrospectionRequest({ query: 'query IntrospectQueryRoot { __schema { queryType { name } } }' })).toBe(true);
	});

	it('does not mistake a data request for an introspection read', () => {
		expect(isIntrospectionRequest({ query: 'query BuiltQuery { pokemon { id } }' })).toBe(false);
		expect(isIntrospectionRequest({ query: 'query SearchValueSource { type { name } }' })).toBe(false);
		expect(isIntrospectionRequest(null)).toBe(false);
	});
});

function flushResourceDiscoveryIfPending(httpMock: HttpTestingController): void {
	for (const request of httpMock.match((requested) => requested.url === endpointUrl)) {
		request.flush({
			data: {
				__type: {
					fields: [{ name: 'pokemon', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'pokemon_bool_exp' } }] }],
				},
			},
		});
	}
}

async function drainCatalogIntrospectionRequests(spectator: Spectator<QueryExplorerComponent>, httpMock: HttpTestingController): Promise<void> {
	for (let iteration = 0; iteration < 8; iteration++) {
		await flush(spectator);
		const pending = httpMock.match((requested) => requested.url === endpointUrl && isIntrospectionRequest(requested.body));
		if (pending.length === 0) return;
		for (const request of pending) {
			request.flush({ data: { __type: { name: 'introspected', kind: 'INPUT_OBJECT', inputFields: [] } } });
		}
	}
}

const realisticIntrospectionFixtures: Record<string, unknown> = {
	pokemon_bool_exp: {
		name: 'pokemon_bool_exp',
		kind: 'INPUT_OBJECT',
		inputFields: [{ name: 'pokemonstats', type: { kind: 'INPUT_OBJECT', name: 'pokemonstat_bool_exp', ofType: null } }],
	},
	pokemonstat_bool_exp: {
		name: 'pokemonstat_bool_exp',
		kind: 'INPUT_OBJECT',
		inputFields: [{ name: 'base_stat', type: { kind: 'INPUT_OBJECT', name: 'Int_comparison_exp', ofType: null } }],
	},
	Int_comparison_exp: {
		name: 'Int_comparison_exp',
		kind: 'INPUT_OBJECT',
		inputFields: [{ name: '_gt', type: { kind: 'SCALAR', name: 'Int', ofType: null } }],
	},
};

async function drainRealisticCatalogIntrospectionRequests(spectator: Spectator<QueryExplorerComponent>, httpMock: HttpTestingController): Promise<void> {
	for (let iteration = 0; iteration < 12; iteration++) {
		await flush(spectator);
		const pending = httpMock.match((requested) => requested.url === endpointUrl && isIntrospectionRequest(requested.body));
		for (const request of pending) {
			const typeName = (request.request.body as { variables: { typeName: string } }).variables.typeName;
			const introspected = realisticIntrospectionFixtures[typeName] ?? { name: typeName, kind: 'INPUT_OBJECT', inputFields: [] };
			request.flush({ data: { __type: introspected } });
		}
	}
}

async function flush(spectator: Spectator<QueryExplorerComponent>): Promise<void> {
	spectator.detectChanges();
	await Promise.resolve();
	await Promise.resolve();
	spectator.detectChanges();
}

async function settle(spectator: Spectator<QueryExplorerComponent>): Promise<void> {
	spectator.detectChanges();
	await spectator.fixture.whenStable();
	spectator.detectChanges();
	for (let frame = 0; frame < 6; frame++) {
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}
	spectator.detectChanges();
}

function getStore(spectator: Spectator<QueryExplorerComponent>): InstanceType<typeof QueryBuilderStore> {
	const queryBuilderDebugElement = spectator.debugElement.query(By.directive(QueryBuilderComponent));
	return queryBuilderDebugElement.injector.get(QueryBuilderStore);
}

describe('QueryExplorerComponent', () => {
	jest.setTimeout(20000);

	let spectator: Spectator<QueryExplorerComponent>;
	let httpMock: HttpTestingController;

	const createComponent = createComponentFactory({
		component: QueryExplorerComponent,
		providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: endpointUrl }],
	});

	beforeEach(async () => {
		registerDataGridModules();
		spectator = createComponent();
		httpMock = spectator.inject(HttpTestingController);
		flushResourceDiscoveryIfPending(httpMock);
		await settle(spectator);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it('renders the builder', () => {
		expect(spectator.query(QueryBuilderComponent)).not.toBeNull();
	});

	it('issues a request to the configured endpoint carrying the emitted document and variables, and shows the rows in the grid', async () => {
		const store = getStore(spectator);
		store.selectResource('pokemon');
		store.setSelection({
			fieldName: '',
			children: [
				{ fieldName: 'id', children: [] },
				{ fieldName: 'name', children: [] },
			],
		});
		await flush(spectator);

		const request = httpMock.expectOne(endpointUrl);
		expect(request.request.method).toBe('POST');
		expect(request.request.body.query).toContain('pokemon');
		expect(request.request.body.variables).toEqual({});

		request.flush({
			data: {
				pokemon: [
					{ id: 1, name: 'bulbasaur' },
					{ id: 4, name: 'charmander' },
				],
			},
		});
		await settle(spectator);

		expect(spectator.element.querySelector('ag-grid-angular')).not.toBeNull();
		expect(spectator.element.textContent).toContain('bulbasaur');
		expect(spectator.element.textContent).toContain('charmander');
	});

	it('renders a visible error state for a GraphQL errors response, rather than an empty grid', async () => {
		const store = getStore(spectator);
		store.selectResource('pokemon');
		store.setSelection({ fieldName: '', children: [{ fieldName: 'nope', children: [] }] });
		await flush(spectator);

		const request = httpMock.expectOne(endpointUrl);
		request.flush({ errors: [{ message: "field 'nope' not found in type: 'pokemon'" }] });
		await settle(spectator);

		const errorElement = spectator.query('[data-testid="query-error"]');
		expect(errorElement).toExist();
		expect(errorElement?.textContent).toContain('not found');
		expect(spectator.element.querySelector('ag-grid-angular')).toBeNull();
	});

	it('reads an empty result set as empty, not as a failure', async () => {
		const store = getStore(spectator);
		store.selectResource('pokemon');
		store.setSelection({ fieldName: '', children: [{ fieldName: 'id', children: [] }] });
		await flush(spectator);

		const request = httpMock.expectOne(endpointUrl);
		request.flush({ data: { pokemon: [] } });
		await settle(spectator);

		expect(spectator.query('[data-testid="query-empty"]')).toExist();
		expect(spectator.query('[data-testid="query-error"]')).not.toExist();
		expect(spectator.element.querySelector('ag-grid-angular')).toBeNull();
	});

	it('can still reach the builder\'s store through the viewChild once the view has initialised, so subquery resolution is not a silent no-op', () => {
		const queryBuilderStore = (spectator.component as unknown as { queryBuilderStore: () => unknown }).queryBuilderStore();

		expect(queryBuilderStore).toBeInstanceOf(QueryBuilderStore);
	});

	it('renders a visible error state when phase-one subquery resolution fails, rather than leaving the query stuck with no explanation', async () => {
		const store = getStore(spectator);
		store.selectResource('pokemon');
		store.setSelection({
			fieldName: '',
			children: [
				{ fieldName: 'id', children: [] },
				{ fieldName: 'name', children: [] },
			],
		});

		const rootNodeId = store.filter().nodeId;
		store.addRule(rootNodeId);
		const ruleNodeId = store.filter().children[store.filter().children.length - 1].nodeId;
		store.updateRule(ruleNodeId, {
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: {
					resourceName: 'pokemonstat',
					filter: createFilterGroup(),
					selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
				},
			},
		});

		await drainCatalogIntrospectionRequests(spectator, httpMock);

		const resolutionRequest = httpMock.expectOne(
			(requested) => requested.url === endpointUrl && !isIntrospectionRequest(requested.body),
		);
		resolutionRequest.flush({ errors: [{ message: "field 'base_stat' not found in type: 'pokemonstat'" }] });
		await settle(spectator);

		const resolutionErrorElement = spectator.query('[data-testid="resolution-error"]');
		expect(resolutionErrorElement).toExist();
		expect(resolutionErrorElement?.textContent).toContain('not found');
	});

	it(
		"coerces a resolved subquery value into the compared column's real scalar type, driven the way production drives " +
			'it (through the catalog and the store), not by hand-supplying the type map',
		async () => {
			const store = getStore(spectator);
			store.selectResource('pokemon');
			store.setSelection({ fieldName: '', children: [{ fieldName: 'id', children: [] }] });

			const rootNodeId = store.filter().nodeId;
			store.addGroup(rootNodeId);
			const statsGroupId = store.filter().children[store.filter().children.length - 1].nodeId;
			store.setRelationScope(statsGroupId, { fieldPath: ['pokemonstats'], quantifier: 'some' });
			store.addRule(statsGroupId);
			const baseStatRuleId = (store.filter().children[store.filter().children.length - 1] as unknown as { children: { nodeId: string }[] })
				.children[0].nodeId;

			store.updateRule(baseStatRuleId, {
				fieldPath: ['base_stat'],
				operatorName: '_gt',
				operand: {
					source: 'subquery',
					subquery: {
						resourceName: 'pokemonstat',
						filter: null,
						selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['base_stat'] },
					},
				},
			});

			await drainRealisticCatalogIntrospectionRequests(spectator, httpMock);

			expect(store.comparisonTypeNames().get(baseStatRuleId)).toBe('Int_comparison_exp');

			const resolutionRequest = httpMock.expectOne((requested) => requested.url === endpointUrl && !isIntrospectionRequest(requested.body));
			resolutionRequest.flush({ data: { pokemonstatAvgBaseStat1: { aggregate: { avg: { base_stat: 72.4 } } } } });
			await settle(spectator);

			expect(store.resolvedValues().get('pokemonstatAvgBaseStat1')).toBe(72.4);
			expect(store.variableTypeNames().get('pokemonstatAvgBaseStat1')).toBe('Int');

			const result = store.compileResult();
			expect(result.status).toBe('complete');
			if (result.status !== 'complete') return;
			expect(result.variables).toEqual({ pokemonstatAvgBaseStat1: 72 });
			expect(result.document.replace(/\s+/g, ' ')).toContain('query BuiltQuery($pokemonstatAvgBaseStat1: Int!)');

			const dataRequest = httpMock.expectOne(
				(requested) => requested.url === endpointUrl && !isIntrospectionRequest(requested.body) && requested.body.query === result.document,
			);
			expect(dataRequest.request.body.variables).toEqual({ pokemonstatAvgBaseStat1: 72 });
			dataRequest.flush({ data: { pokemon: [] } });
			await settle(spectator);
		},
	);
});
