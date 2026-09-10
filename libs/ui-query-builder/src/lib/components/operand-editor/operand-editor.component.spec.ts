import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { QUERY_BUILDER_ENDPOINT } from '../../metadata/query-builder-metadata';
import type { FilterOperand } from '../../core/model/query-tree';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { OutputFieldDescriptor } from '../../core/metadata/introspection-types';
import { OperandEditorComponent } from './operand-editor.component';

const pokemonOutputFields: readonly OutputFieldDescriptor[] = [
	{ kind: 'scalar', fieldName: 'height', scalarTypeName: 'Int' },
	{ kind: 'scalar', fieldName: 'base_experience', scalarTypeName: 'Int' },
];

const typeOutputFields: readonly OutputFieldDescriptor[] = [{ kind: 'scalar', fieldName: 'name', scalarTypeName: 'String' }];

const subqueryCatalog: QueryBuilderCatalog = {
	readBooleanExpressionFields: async () => [],
	readOperatorsForComparisonType: async () => [],
	readOutputObjectFields: async (typeName) => (typeName === 'pokemon' ? pokemonOutputFields : typeName === 'type' ? typeOutputFields : []),
};

describe('OperandEditorComponent', () => {
	let spectator: Spectator<OperandEditorComponent>;
	let httpMock: HttpTestingController;
	const createComponent = createComponentFactory({
		component: OperandEditorComponent,
		providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
	});

	it('renders a literal input by default', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: 'pikachu' } } });

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		expect(literalInput).toExist();
		expect(literalInput?.value).toBe('pikachu');
		expect(spectator.query('[data-testid="operand-subquery-editor"]')).not.toExist();
		expect(spectator.query('[data-testid="value-select"]')).not.toExist();
	});

	it('reveals the subquery editor when the source switches to subquery', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null } } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const subqueryOption = spectator.query<HTMLElement>('[data-testid="operand-source-subquery"]');
		if (!subqueryOption) throw new Error('expected a subquery source option');
		spectator.click(subqueryOption);
		spectator.detectChanges();

		expect(latestOperand?.source).toBe('subquery');
		if (!latestOperand) throw new Error('expected an emitted operand');
		spectator.setInput('operand', latestOperand);
		spectator.detectChanges();

		expect(spectator.query('[data-testid="operand-subquery-editor"]')).toExist();
	});

	it('emits a literal operand matching the discriminated union when typed', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: '' } } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('25', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: '25' });
	});

	it('emits a numeric literal when the argument type is Int', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int' } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('10', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: 10 });
	});

	it('rounds a float typed into an Int argument', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int' } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('72.6', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: 73 });
	});

	it('emits null instead of NaN when the numeric input is invalid', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int' } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('not-a-number', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: null });
	});

	it('emits a boolean literal when the argument type is Boolean', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Boolean' } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('true', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: true });
	});

	it('parses a comma-separated list into a numeric array when the operator accepts a list', () => {
		spectator = createComponent({
			props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int', acceptsList: true },
		});

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('1, 2, 3', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: [1, 2, 3] });
	});

	it('emits null for a list when any segment fails to parse', () => {
		spectator = createComponent({
			props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int', acceptsList: true },
		});

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('1, x, 3', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: null });
	});

	it('displays the resolved value alongside the subquery description, labelled rather than as raw identifiers', () => {
		const operand: FilterOperand = {
			source: 'subquery',
			subquery: {
				resourceName: 'pokemonstat',
				filter: null,
				selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['base_stat'] },
			},
		};
		spectator = createComponent({ props: { operand, resolvedValue: 12 } });

		const resolved = spectator.query('[data-testid="operand-resolved-value"]');
		expect(resolved).toExist();
		expect(resolved?.textContent).toContain('Avg of Base Stat on Pokemonstat');
		expect(resolved?.textContent).not.toContain('base_stat');
		expect(resolved?.textContent).toContain('12');
	});

	describe('with a shortcut-declared value source', () => {
		beforeEach(() => {
			spectator = createComponent({
				props: { operand: { source: 'literal', value: null }, valueSource: { resourceName: 'type', valueFieldName: 'name' } },
			});
			httpMock = spectator.inject(HttpTestingController);
		});

		afterEach(() => {
			httpMock.verify();
		});

		it('offers value options from the shortcut value source, humanized, and emits the raw slug', async () => {
			const emitted: FilterOperand[] = [];
			spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

			spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
			httpMock.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
			expect(labels).toEqual(['Grass', 'Fire']);

			spectator.click('[data-testid="search-select-option"]');
			expect(emitted).toEqual([{ source: 'literal', value: 'grass' }]);
		});

		it('shows an error rather than an empty list when the value query fails', async () => {
			spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
			httpMock.expectOne('/api/graphql').flush({ errors: [{ message: 'field "type" not found' }] });
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			expect(spectator.query('[data-testid="search-select-error"]')).toContainText('not found');
			expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();
		});

		it('debounces re-querying on typed search text to a single request', () => {
			jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'] });
			try {
				spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
				spectator.detectChanges();
				httpMock.expectOne('/api/graphql').flush({ data: { type: [] } });
				spectator.detectChanges();

				const searchInput = spectator.query<HTMLInputElement>('[data-testid="search-select-search"]');
				if (!searchInput) throw new Error('expected the search input inside the value select');

				spectator.typeInElement('g', searchInput);
				jest.advanceTimersByTime(50);
				spectator.typeInElement('gr', searchInput);
				jest.advanceTimersByTime(50);
				spectator.typeInElement('gra', searchInput);

				httpMock.expectNone('/api/graphql');

				jest.advanceTimersByTime(200);
				spectator.detectChanges();

				const request = httpMock.expectOne('/api/graphql');
				expect(request.request.body.variables).toEqual({ searchText: '%gra%' });
				request.flush({ data: { type: [] } });
			} finally {
				jest.useRealTimers();
			}
		});
	});

	describe('with a shortcut-declared value source and a list operator', () => {
		beforeEach(() => {
			spectator = createComponent({
				props: {
					operand: { source: 'literal', value: null },
					valueSource: { resourceName: 'type', valueFieldName: 'name' },
					acceptsList: true,
				},
			});
			httpMock = spectator.inject(HttpTestingController);
		});

		afterEach(() => {
			httpMock.verify();
		});

		it('emits a list operand, not a bare scalar, when a value is chosen', async () => {
			const emitted: FilterOperand[] = [];
			spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

			spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
			httpMock.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const grassOption = spectator
				.queryAll<HTMLElement>('[data-testid="search-select-option"]')
				.find((option) => option.textContent?.trim() === 'Grass');
			if (!grassOption) throw new Error('expected a Grass option');
			spectator.click(grassOption);

			expect(emitted).toEqual([{ source: 'literal', value: ['grass'] }]);
		});

		it('accumulates a second chosen value into the same list and renders both as chips', async () => {
			const emitted: FilterOperand[] = [];
			spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

			spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
			httpMock.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const grassOption = spectator
				.queryAll<HTMLElement>('[data-testid="search-select-option"]')
				.find((option) => option.textContent?.trim() === 'Grass');
			if (!grassOption) throw new Error('expected a Grass option');
			spectator.click(grassOption);

			spectator.setInput('operand', { source: 'literal', value: ['grass'] });
			spectator.detectChanges();

			spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
			httpMock.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const fireOption = spectator
				.queryAll<HTMLElement>('[data-testid="search-select-option"]')
				.find((option) => option.textContent?.trim() === 'Fire');
			if (!fireOption) throw new Error('expected a Fire option');
			spectator.click(fireOption);

			expect(emitted[emitted.length - 1]).toEqual({ source: 'literal', value: ['grass', 'fire'] });

			spectator.setInput('operand', { source: 'literal', value: ['grass', 'fire'] });
			spectator.detectChanges();

			const chipLabels = spectator.queryAll('[data-testid="value-chip"]').map((chip) => chip.textContent?.replace('×', '').trim());
			expect(chipLabels).toEqual(['Grass', 'Fire']);
		});

		it('removes a chosen value from the list through its chip, emitting null once the list empties', () => {
			spectator.setInput('operand', { source: 'literal', value: ['grass'] });
			spectator.detectChanges();

			const emitted: FilterOperand[] = [];
			spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

			spectator.click('[data-testid="remove-value"]');

			expect(emitted).toEqual([{ source: 'literal', value: null }]);
		});

		it('humanizes a hyphenated value restored from an earlier session, rather than showing the raw slug on the chip', () => {
			spectator.setInput('operand', { source: 'literal', value: ['special-attack'] });
			spectator.detectChanges();

			const chipLabels = spectator.queryAll('[data-testid="value-chip"]').map((chip) => chip.textContent?.replace('×', '').trim());
			expect(chipLabels).toEqual(['Special Attack']);
		});
	});

	it('keeps the plain literal input when no value source is declared', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int' } });

		expect(spectator.query('[data-testid="operand-literal-input"]')).toExist();
		expect(spectator.query('[data-testid="value-select"]')).not.toExist();
	});

	describe('subquery resource and field pickers', () => {
		const emptySubqueryOperand: FilterOperand = {
			source: 'subquery',
			subquery: { resourceName: '', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } },
		};

		beforeEach(() => {
			spectator = createComponent({ props: { operand: emptySubqueryOperand } });
			httpMock = spectator.inject(HttpTestingController);
		});

		afterEach(() => {
			httpMock.verify();
		});

		it('has no free-text inputs for the resource or the field path', () => {
			expect(spectator.query('[data-testid="operand-subquery-resource"] input')).not.toExist();
			expect(spectator.query('[data-testid="operand-subquery-field-path"] input:not([data-testid="search-select-search"])')).not.toExist();
		});

		it('offers discovered resources, labelled and sorted, and emits the same operand shape as before', async () => {
			const emitted: FilterOperand[] = [];
			spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

			spectator.click('[data-testid="operand-subquery-resource"] [data-testid="search-select-trigger"]');
			httpMock.expectOne('/api/graphql').flush({
				data: {
					__type: {
						fields: [
							{ name: 'zubat', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'zubat_bool_exp' } }] },
							{ name: 'arbok', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'arbok_bool_exp' } }] },
						],
					},
				},
			});
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
			expect(labels).toEqual(['Arbok', 'Zubat']);
			expect(labels).not.toContain('zubat');

			const arbokOption = spectator
				.queryAll<HTMLElement>('[data-testid="search-select-option"]')
				.find((option) => option.textContent?.trim() === 'Arbok');
			if (!arbokOption) throw new Error('expected an Arbok option');
			spectator.click(arbokOption);

			expect(emitted).toEqual([
				{ source: 'subquery', subquery: { resourceName: 'arbok', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } } },
			]);
		});

		it('leaves the field-path picker empty without erroring when no resource is chosen', () => {
			expect(spectator.query('[data-testid="operand-subquery-field-path"] [data-testid="search-select-error"]')).not.toExist();
			expect(spectator.queryAll('[data-testid="operand-subquery-field-path"] [data-testid="search-select-option"]')).toHaveLength(0);
		});

		it('offers output fields for the chosen resource, labelled, and emits the field path array on selection', async () => {
			spectator.setInput('operand', {
				source: 'subquery',
				subquery: { resourceName: 'pokemon', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } },
			});
			spectator.setInput('catalog', subqueryCatalog);
			spectator.detectChanges();
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const emitted: FilterOperand[] = [];
			spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

			spectator.click('[data-testid="operand-subquery-field-path"] [data-testid="search-select-trigger"]');
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
			expect(labels).toContain('Height');
			expect(labels).not.toContain('height');

			const heightOption = spectator
				.queryAll<HTMLElement>('[data-testid="search-select-option"]')
				.find((option) => option.textContent?.trim() === 'Height');
			if (!heightOption) throw new Error('expected a Height option');
			spectator.click(heightOption);

			expect(emitted).toEqual([
				{
					source: 'subquery',
					subquery: { resourceName: 'pokemon', filter: null, selector: { kind: 'row', fieldPath: ['height'], ordering: null } },
				},
			]);
		});

		it('shows the loading state, not the empty state, while the deferred field-path read is in flight', async () => {
			let resolveOutputFields: ((fields: readonly OutputFieldDescriptor[]) => void) | undefined;
			const deferredCatalog: QueryBuilderCatalog = {
				readBooleanExpressionFields: async () => [],
				readOperatorsForComparisonType: async () => [],
				readOutputObjectFields: () =>
					new Promise<readonly OutputFieldDescriptor[]>((resolve) => {
						resolveOutputFields = resolve;
					}),
			};
			spectator.setInput('operand', {
				source: 'subquery',
				subquery: { resourceName: 'pokemon', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } },
			});
			spectator.setInput('catalog', deferredCatalog);
			spectator.detectChanges();

			spectator.click('[data-testid="operand-subquery-field-path"] [data-testid="search-select-trigger"]');
			spectator.detectChanges();

			expect(spectator.query('[data-testid="search-select-loading"]')).toExist();
			expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();

			if (!resolveOutputFields) throw new Error('expected the field-path read to have started');
			resolveOutputFields(pokemonOutputFields);
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			expect(spectator.query('[data-testid="search-select-loading"]')).not.toExist();
			const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
			expect(labels).toContain('Height');
		});

		it('refreshes the field options when the resource changes', async () => {
			spectator.setInput('operand', {
				source: 'subquery',
				subquery: { resourceName: 'pokemon', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } },
			});
			spectator.setInput('catalog', subqueryCatalog);
			spectator.detectChanges();
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			spectator.click('[data-testid="operand-subquery-field-path"] [data-testid="search-select-trigger"]');
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			let labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
			expect(labels).toContain('Height');

			spectator.setInput('operand', {
				source: 'subquery',
				subquery: { resourceName: 'type', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } },
			});
			spectator.detectChanges();
			await spectator.fixture.whenStable();
			spectator.detectChanges();

			labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
			expect(labels).not.toContain('Height');
			expect(labels).toContain('Name');
		});
	});
});
