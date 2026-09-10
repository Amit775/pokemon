import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { QUERY_BUILDER_ENDPOINT } from '../../metadata/query-builder-metadata';
import type { FilterOperand } from '../../core/model/query-tree';
import { OperandEditorComponent } from './operand-editor.component';

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

	it('displays the resolved value alongside the subquery description', () => {
		const operand: FilterOperand = {
			source: 'subquery',
			subquery: {
				resourceName: 'Pokemon',
				filter: null,
				selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['height'] },
			},
		};
		spectator = createComponent({ props: { operand, resolvedValue: 12 } });

		const resolved = spectator.query('[data-testid="operand-resolved-value"]');
		expect(resolved).toExist();
		expect(resolved?.textContent).toContain('avg of height on Pokemon');
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

	it('keeps the plain literal input when no value source is declared', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null }, argumentTypeName: 'Int' } });

		expect(spectator.query('[data-testid="operand-literal-input"]')).toExist();
		expect(spectator.query('[data-testid="value-select"]')).not.toExist();
	});
});
