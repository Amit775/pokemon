import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, resource, signal, untracked } from '@angular/core';
import { SearchSelectComponent, type SearchSelectOption } from '@pokemon-center/ui-pokedex';
import type { SelectionNode } from '../../core/compiler/build-selection';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { OutputFieldDescriptor } from '../../core/metadata/introspection-types';
import { QUERY_BUILDER_METADATA } from '../../metadata/query-builder-metadata';
import { resolveFieldLabel } from '../../metadata/resolve-labels';

const emptyQueryBuilderCatalog: QueryBuilderCatalog = {
	readBooleanExpressionFields: async () => [],
	readOperatorsForComparisonType: async () => [],
	readOutputObjectFields: async () => [],
};

@Component({
	selector: 'pokedex-selection-editor',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [SearchSelectComponent],
	template: `
		<div class="selection-editor">
			<ul class="field-list">
				@for (child of selectionModel().children; track child.fieldName) {
					<li class="field-chip" data-testid="selection-field">
						{{ fieldLabel(child.fieldName) }}
						<button type="button" class="remove-field" data-testid="remove-field" (click)="removeField(child.fieldName)">×</button>
					</li>
				}
			</ul>

			<div class="selection-add" data-testid="selection-add">
				<pokedex-search-select
					[options]="fieldOptions()"
					[value]="null"
					placeholder="Add field"
					(valueChosen)="addField($event)"
					(click)="onAddFieldAreaClicked($event)"
				/>
			</div>
		</div>
	`,
	styles: `
		:host { display: block; }
		.selection-editor { display: flex; flex-direction: column; gap: var(--s-2); }
		.field-list { display: flex; flex-wrap: wrap; gap: var(--s-1); list-style: none; margin: 0; padding: 0; }
		.field-chip {
			display: inline-flex;
			align-items: center;
			gap: var(--s-1);
			font-size: var(--fs-xs);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			background: var(--accent-soft);
			color: var(--accent);
		}
		.remove-field { background: none; border: none; color: inherit; cursor: pointer; font-size: var(--fs-sm); line-height: 1; padding: 0; }
		.selection-add { display: flex; gap: var(--s-1); }
		button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	`,
})
export class SelectionEditorComponent {
	readonly resourceName = input.required<string>();
	readonly selection = input.required<SelectionNode>();
	readonly catalog = input<QueryBuilderCatalog>(emptyQueryBuilderCatalog);
	readonly selectionChanged = output<SelectionNode>();

	private readonly metadata = inject(QUERY_BUILDER_METADATA);

	protected readonly selectionModel = linkedSignal(() => this.selection());

	protected readonly fieldOptionsRequested = signal(false);

	private readonly outputFieldsResource = resource({
		params: () => (this.fieldOptionsRequested() ? { catalog: this.catalog(), resourceName: this.resourceName() } : undefined),
		loader: ({ params }) => params.catalog.readOutputObjectFields(params.resourceName),
		defaultValue: [] as readonly OutputFieldDescriptor[],
	});

	protected readonly fieldOptions = computed<readonly SearchSelectOption[]>(() =>
		this.outputFieldsResource
			.value()
			.filter((field) => field.kind === 'scalar')
			.map((field) => ({ value: field.fieldName, label: this.fieldLabel(field.fieldName) })),
	);

	private lastDefaultedResourceName: string | null = null;

	constructor() {
		effect(() => {
			const resourceName = this.resourceName();
			if (resourceName === this.lastDefaultedResourceName) return;
			this.lastDefaultedResourceName = resourceName;

			const currentSelection = untracked(this.selectionModel);
			if (currentSelection.children.length > 0) return;

			const matchingResourceMetadata = this.metadata.resources.find((candidateResource) => candidateResource.resourceName === resourceName);
			const defaultFieldNames = matchingResourceMetadata?.defaultSelectionFieldNames;
			if (!defaultFieldNames || defaultFieldNames.length === 0) return;

			this.emitSelection({ fieldName: '', children: defaultFieldNames.map((fieldName) => ({ fieldName, children: [] })) });
		});
	}

	protected onAddFieldAreaClicked(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.closest('[data-testid="search-select-trigger"]')) return;
		this.fieldOptionsRequested.set(true);
	}

	protected fieldLabel(fieldName: string): string {
		return resolveFieldLabel(this.metadata, this.resourceName(), fieldName);
	}

	protected addField(fieldName: string): void {
		const current = this.selectionModel();
		if (current.children.some((child) => child.fieldName === fieldName)) return;
		this.emitSelection({ ...current, children: [...current.children, { fieldName, children: [] }] });
	}

	protected removeField(fieldName: string): void {
		const current = this.selectionModel();
		this.emitSelection({ ...current, children: current.children.filter((child) => child.fieldName !== fieldName) });
	}

	private emitSelection(selection: SelectionNode): void {
		this.selectionModel.set(selection);
		this.selectionChanged.emit(selection);
	}
}
