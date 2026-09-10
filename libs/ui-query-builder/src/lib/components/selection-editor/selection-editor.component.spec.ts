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
