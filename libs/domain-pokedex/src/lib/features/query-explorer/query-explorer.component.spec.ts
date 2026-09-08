import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { QUERY_BUILDER_ENDPOINT, QueryBuilderComponent, QueryBuilderStore } from '@pokemon-center/ui-query-builder';
import { registerDataGridModules } from '@pokemon-center/ui-pokedex';
import { QueryExplorerComponent } from './query-explorer.component';

const endpointUrl = '/api/query-builder/graphql';

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
});
