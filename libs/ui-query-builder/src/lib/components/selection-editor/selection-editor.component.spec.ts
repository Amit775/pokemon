import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { QUERY_BUILDER_METADATA, type QueryBuilderMetadata } from '../../metadata/query-builder-metadata';
import type { SelectionNode } from '../../core/compiler/build-selection';
import { SelectionEditorComponent } from './selection-editor.component';

const metadata: QueryBuilderMetadata = {
	resources: [{ resourceName: 'pokemon', displayName: 'Pokemon', group: 'Core', priority: 0, shortcuts: [], defaultSelectionFieldNames: ['id', 'name'] }],
	resourceLabels: {},
	fieldLabels: {},
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

	it('adding a field updates the selection', () => {
		spectator = createComponent({ props: { resourceName: 'pokemon', selection: { fieldName: '', children: [{ fieldName: 'id', children: [] }] } } });
		const emitted: SelectionNode[] = [];
		spectator.component.selectionChanged.subscribe((selection) => emitted.push(selection));

		spectator.typeInElement('height', '[data-testid="field-name-input"]');
		spectator.click('[data-testid="add-field-button"]');

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
});
