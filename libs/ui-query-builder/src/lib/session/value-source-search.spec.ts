import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QUERY_BUILDER_ENDPOINT } from '../metadata/query-builder-metadata';
import { createValueSourceSearch } from './value-source-search';

function setup() {
	TestBed.configureTestingModule({
		providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
	});
	const search = TestBed.runInInjectionContext(() => createValueSourceSearch());
	return { search, controller: TestBed.inject(HttpTestingController) };
}

describe('value source search', () => {
	it('queries without a filter when the search text is empty, limited to 50', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'type', valueFieldName: 'name' }, '');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('type(');
		expect(request.request.body.query).toContain('limit: 50');
		expect(request.request.body.query).not.toContain('_ilike');

		request.flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });

		await expect(pending).resolves.toEqual([
			{ value: 'grass', label: 'Grass' },
			{ value: 'fire', label: 'Fire' },
		]);
		controller.verify();
	});

	it('filters with _ilike when search text is given', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'move', valueFieldName: 'name' }, 'razor');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('_ilike');
		expect(request.request.body.variables).toEqual({ searchText: '%razor%' });

		request.flush({ data: { move: [{ name: 'razor-leaf' }] } });

		await expect(pending).resolves.toEqual([{ value: 'razor-leaf', label: 'Razor Leaf' }]);
	});

	it('humanizes the label but emits the raw slug as the value', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'move', valueFieldName: 'name' }, '');

		controller.expectOne('/api/graphql').flush({ data: { move: [{ name: 'double-edge' }] } });

		await expect(pending).resolves.toEqual([{ value: 'double-edge', label: 'Double Edge' }]);
	});

	it('searches a different field when searchFieldName is given', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'item', valueFieldName: 'name', searchFieldName: 'name' }, 'ball');

		const request = controller.expectOne('/api/graphql');
		request.flush({ data: { item: [] } });

		await expect(pending).resolves.toEqual([]);
	});

	it('builds the where clause against searchFieldName, not valueFieldName, when they differ', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'pokemon_species', valueFieldName: 'id', searchFieldName: 'name' }, 'char');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('name: {_ilike: $searchText}');
		expect(request.request.body.query).not.toContain('id: {_ilike: $searchText}');

		request.flush({ data: { pokemon_species: [{ id: '6' }] } });

		await expect(pending).resolves.toEqual([{ value: '6', label: '6' }]);
	});

	it('falls back to valueFieldName for the where clause when searchFieldName is absent', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'ability', valueFieldName: 'name' }, 'sturd');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('name: {_ilike: $searchText}');

		request.flush({ data: { ability: [{ name: 'sturdy' }] } });

		await expect(pending).resolves.toEqual([{ value: 'sturdy', label: 'Sturdy' }]);
	});

	it('throws when the response carries graphql errors', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'type', valueFieldName: 'name' }, '');

		controller.expectOne('/api/graphql').flush({ errors: [{ message: 'field "type" not found' }] });

		await expect(pending).rejects.toThrow('field "type" not found');
	});

	it('skips a row whose value field is null instead of rejecting the whole search', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'type', valueFieldName: 'name' }, '');

		controller.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }, { name: null }, { name: 'fire' }] } });

		await expect(pending).resolves.toEqual([
			{ value: 'grass', label: 'Grass' },
			{ value: 'fire', label: 'Fire' },
		]);
	});

	it('coerces a numeric value field into a string value instead of crashing', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'pokemon_species', valueFieldName: 'id' }, '');

		controller.expectOne('/api/graphql').flush({ data: { pokemon_species: [{ id: 6 }] } });

		await expect(pending).resolves.toEqual([{ value: '6', label: '6' }]);
	});

	it('orders ascending by the displayed field, with asc as an unquoted enum value', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'type', valueFieldName: 'name' }, '');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('order_by: {name: asc}');
		expect(request.request.body.query).not.toContain('"asc"');

		request.flush({ data: { type: [] } });

		await pending;
	});

	it('escapes ILIKE metacharacters in the search text before binding the variable', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'move', valueFieldName: 'name' }, '50%_off');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.variables).toEqual({ searchText: '%50\\%\\_off%' });

		request.flush({ data: { move: [] } });

		await pending;
	});
});
