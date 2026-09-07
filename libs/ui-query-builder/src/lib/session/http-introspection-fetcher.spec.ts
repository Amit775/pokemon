import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QUERY_BUILDER_ENDPOINT } from '../overlay/query-builder-overlay';
import { createHttpIntrospectionFetcher, discoverResources } from './http-introspection-fetcher';

describe('http introspection fetcher', () => {
	it('posts a __type query to the configured endpoint and unwraps the result', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
		});

		const fetcher = TestBed.runInInjectionContext(() => createHttpIntrospectionFetcher());
		const pending = fetcher('pokemon_bool_exp');

		const controller = TestBed.inject(HttpTestingController);
		const request = controller.expectOne('/api/graphql');
		expect(request.request.method).toBe('POST');
		expect(request.request.body.variables).toEqual({ typeName: 'pokemon_bool_exp' });

		request.flush({ data: { __type: { name: 'pokemon_bool_exp', kind: 'INPUT_OBJECT', inputFields: [] } } });

		await expect(pending).resolves.toMatchObject({ name: 'pokemon_bool_exp' });
		controller.verify();
	});

	it('resolves null for a type the endpoint does not know', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
		});

		const fetcher = TestBed.runInInjectionContext(() => createHttpIntrospectionFetcher());
		const pending = fetcher('nope_bool_exp');

		TestBed.inject(HttpTestingController).expectOne('/api/graphql').flush({ data: { __type: null } });

		await expect(pending).resolves.toBeNull();
	});
});

describe('discoverResources', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
		});
	});

	it(
		'rejects on a GraphQL errors array, evicts the failed attempt so a retry is possible, shares one request across ' +
			'concurrent callers on that retry, then keeps serving the resolved list without another request',
		async () => {
			const failingCall = TestBed.runInInjectionContext(() => discoverResources());
			TestBed.inject(HttpTestingController)
				.expectOne('/api/graphql')
				.flush({ errors: [{ message: 'temporary outage' }] });
			await expect(failingCall).rejects.toThrow('temporary outage');

			const firstRetryCall = TestBed.runInInjectionContext(() => discoverResources());
			const secondRetryCall = TestBed.runInInjectionContext(() => discoverResources());

			const controller = TestBed.inject(HttpTestingController);
			controller.expectOne('/api/graphql').flush({
				data: {
					__type: {
						fields: [{ name: 'pokemon', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'pokemon_bool_exp' } }] }],
					},
				},
			});
			controller.verify();

			const [firstResult, secondResult] = await Promise.all([firstRetryCall, secondRetryCall]);
			expect(firstResult).toEqual([{ resourceName: 'pokemon', booleanExpressionTypeName: 'pokemon_bool_exp' }]);
			expect(secondResult).toBe(firstResult);

			const cachedResult = await TestBed.runInInjectionContext(() => discoverResources());
			expect(cachedResult).toBe(firstResult);
			controller.verify();
		},
	);
});
