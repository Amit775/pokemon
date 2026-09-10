import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { OutputFieldDescriptor } from '../../core/metadata/introspection-types';
import { QUERY_BUILDER_METADATA, type QueryBuilderMetadata } from '../../metadata/query-builder-metadata';
import type { SelectionNode } from '../../core/compiler/build-selection';
import { SelectionEditorComponent } from './selection-editor.component';

const metadata: QueryBuilderMetadata = {
	resources: [{ resourceName: 'pokemon', displayName: 'Pokemon', group: 'Core', priority: 0, shortcuts: [], defaultSelectionFieldNames: ['id', 'name'] }],
	resourceLabels: {},
	fieldLabels: {},
};

const pokemonOutputFields: readonly OutputFieldDescriptor[] = [
	{ kind: 'scalar', fieldName: 'id', scalarTypeName: 'Int' },
	{ kind: 'scalar', fieldName: 'name', scalarTypeName: 'String' },
	{ kind: 'scalar', fieldName: 'height', scalarTypeName: 'Int' },
	{ kind: 'scalar', fieldName: 'base_experience', scalarTypeName: 'Int' },
	{ kind: 'relation', fieldName: 'pokemontypes', objectTypeName: 'pokemontype', isList: true },
];

const pokemonCatalog: QueryBuilderCatalog = {
	readBooleanExpressionFields: async () => [],
	readOperatorsForComparisonType: async () => [],
	readOutputObjectFields: async (typeName) => (typeName === 'pokemon' ? pokemonOutputFields : []),
};

describe('SelectionEditorComponent', () => {
	let spectator: Spectator<SelectionEditorComponent>;
	const createComponent = createComponentFactory({
		component: SelectionEditorComponent,
		providers: [{ provide: QUERY_BUILDER_METADATA, useValue: metadata }],
	});

	it('defaults the selection from the overlay for the chosen resource', () => {
		const emitted: SelectionNode[] = [];
		spectator = createComponent({ props: { resourceName: 'pokemon', selection: { fieldName: '', children: [] } }, detectChanges: false });
		spectator.component.selectionChanged.subscribe((selection) => emitted.push(selection));
		spectator.detectChanges();

		expect(emitted).toHaveLength(1);
		expect(emitted[0].children.map((child) => child.fieldName)).toEqual(['id', 'name']);
	});

	it('adding a field updates the selection', async () => {
		spectator = createComponent({
			props: { resourceName: 'pokemon', catalog: pokemonCatalog, selection: { fieldName: '', children: [{ fieldName: 'id', children: [] }] } },
		});
		const emitted: SelectionNode[] = [];
		spectator.component.selectionChanged.subscribe((selection) => emitted.push(selection));

		spectator.click('[data-testid="selection-add"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const heightOption = spectator
			.queryAll<HTMLElement>('[data-testid="search-select-option"]')
			.find((option) => option.textContent?.trim() === 'Height');
		if (!heightOption) throw new Error('expected a Height option');
		spectator.click(heightOption);

		const latest = emitted[emitted.length - 1];
		expect(latest.children.map((child) => child.fieldName)).toEqual(['id', 'height']);
	});

	it('removing the last field leaves the selection empty', () => {
		spectator = createComponent({ props: { resourceName: 'pokemon', selection: { fieldName: '', children: [{ fieldName: 'id', children: [] }] } } });
		const emitted: SelectionNode[] = [];
		spectator.component.selectionChanged.subscribe((selection) => emitted.push(selection));

		spectator.click('[data-testid="remove-field"]');

		const latest = emitted[emitted.length - 1];
		expect(latest.children).toEqual([]);
	});

	it('offers only leaf-selectable scalar fields, never relation fields', async () => {
		spectator = createComponent({
			props: { resourceName: 'pokemon', catalog: pokemonCatalog, selection: { fieldName: '', children: [] } },
		});

		spectator.click('[data-testid="selection-add"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Height');
		expect(labels).not.toContain('Pokemontypes');
		expect(labels).not.toContain('pokemontypes');
	});

	it('reads the output fields only once the add-field picker is opened', async () => {
		const readOutputObjectFields = jest.fn(async () => pokemonOutputFields);
		const countingCatalog: QueryBuilderCatalog = {
			readBooleanExpressionFields: async () => [],
			readOperatorsForComparisonType: async () => [],
			readOutputObjectFields,
		};
		spectator = createComponent({
			props: { resourceName: 'pokemon', catalog: countingCatalog, selection: { fieldName: '', children: [] } },
		});
		await spectator.fixture.whenStable();

		expect(readOutputObjectFields).not.toHaveBeenCalled();

		spectator.click('[data-testid="selection-add"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(readOutputObjectFields).toHaveBeenCalledTimes(1);
	});

	it('shows the loading state, not the empty state, while the deferred field read is in flight', async () => {
		let resolveOutputFields: ((fields: readonly OutputFieldDescriptor[]) => void) | undefined;
		const deferredCatalog: QueryBuilderCatalog = {
			readBooleanExpressionFields: async () => [],
			readOperatorsForComparisonType: async () => [],
			readOutputObjectFields: () =>
				new Promise<readonly OutputFieldDescriptor[]>((resolve) => {
					resolveOutputFields = resolve;
				}),
		};
		spectator = createComponent({
			props: { resourceName: 'pokemon', catalog: deferredCatalog, selection: { fieldName: '', children: [] } },
		});

		spectator.click('[data-testid="selection-add"] [data-testid="search-select-trigger"]');
		spectator.detectChanges();

		expect(spectator.query('[data-testid="search-select-loading"]')).toExist();
		expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();

		if (!resolveOutputFields) throw new Error('expected the field read to have started');
		resolveOutputFields(pokemonOutputFields);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="search-select-loading"]')).not.toExist();
		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Height');
	});

	it('picks selection fields from the output type', async () => {
		spectator = createComponent({
			props: { resourceName: 'pokemon', catalog: pokemonCatalog, selection: { fieldName: '', children: [] } },
		});

		spectator.click('[data-testid="selection-add"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Base Experience');
		expect(labels).not.toContain('base_experience');
		expect(spectator.query('[data-testid="selection-field-input"]')).not.toExist();
	});
});
