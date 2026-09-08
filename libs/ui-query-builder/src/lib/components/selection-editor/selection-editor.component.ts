import { ChangeDetectionStrategy, Component, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import type { SelectionNode } from '../../core/compiler/build-selection';
import { QUERY_BUILDER_OVERLAY } from '../../overlay/query-builder-overlay';

@Component({
	selector: 'pokedex-selection-editor',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [],
	template: `
		<div class="selection-editor">
			<ul class="field-list">
				@for (child of selectionModel().children; track child.fieldName) {
					<li class="field-chip" data-testid="selection-field">
						{{ child.fieldName }}
						<button type="button" class="remove-field" data-testid="remove-field" (click)="removeField(child.fieldName)">×</button>
					</li>
				}
			</ul>

			<div class="add-field">
				<input
					type="text"
					class="field-name-input"
					placeholder="field name"
					data-testid="field-name-input"
					[value]="fieldDraft()"
					(input)="fieldDraft.set($any($event.target).value)"
				/>
				<button type="button" data-testid="add-field-button" (click)="addField()">Add field</button>
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
		.add-field { display: flex; gap: var(--s-1); }
		.field-name-input {
			font: inherit;
			font-size: var(--fs-sm);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-sm);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink);
		}
		button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	`,
})
export class SelectionEditorComponent {
	readonly resourceName = input.required<string>();
	readonly selection = input.required<SelectionNode>();
	readonly selectionChanged = output<SelectionNode>();

	private readonly overlay = inject(QUERY_BUILDER_OVERLAY);

	protected readonly selectionModel = linkedSignal(() => this.selection());
	protected readonly fieldDraft = signal('');

	private lastDefaultedResourceName: string | null = null;

	constructor() {
		effect(() => {
			const resourceName = this.resourceName();
			if (resourceName === this.lastDefaultedResourceName) return;
			this.lastDefaultedResourceName = resourceName;

			const currentSelection = untracked(this.selectionModel);
			if (currentSelection.children.length > 0) return;

			const defaultFieldNames = this.overlay.resources[resourceName]?.defaultSelectionFieldNames;
			if (!defaultFieldNames || defaultFieldNames.length === 0) return;

			this.emitSelection({ fieldName: '', children: defaultFieldNames.map((fieldName) => ({ fieldName, children: [] })) });
		});
	}

	protected addField(): void {
		const fieldName = this.fieldDraft().trim();
		if (fieldName.length === 0) return;
		const current = this.selectionModel();
		if (current.children.some((child) => child.fieldName === fieldName)) return;
		this.emitSelection({ ...current, children: [...current.children, { fieldName, children: [] }] });
		this.fieldDraft.set('');
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
