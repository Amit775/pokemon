import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import { isFilterGroup, type FilterGroup, type FilterRule, type QueryBuilderNode } from '../../core/model/query-tree';
import type { ResourceDescriptor } from '../../core/metadata/read-resources';
import { QueryBuilderStore } from '../../session/query-builder.store';
import { FilterGroupComponent, type FilterGroupPatch } from '../filter-group/filter-group.component';
import { QueryPreviewComponent } from '../query-preview/query-preview.component';
import { SelectionEditorComponent } from '../selection-editor/selection-editor.component';

export interface CompiledQuery {
	readonly document: string;
	readonly variables: Record<string, unknown>;
}

function findNode(root: FilterGroup, nodeId: string): QueryBuilderNode | null {
	if (root.nodeId === nodeId) return root;
	for (const child of root.children) {
		if (child.nodeId === nodeId) return child;
		if (isFilterGroup(child)) {
			const found = findNode(child, nodeId);
			if (found) return found;
		}
	}
	return null;
}

@Component({
	selector: 'pokedex-query-builder',
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [QueryBuilderStore],
	imports: [FilterGroupComponent, SelectionEditorComponent, QueryPreviewComponent],
	template: `
		<div class="query-builder">
			<ul class="resource-list" aria-label="Resource">
				@for (resource of resources(); track resource.resourceName) {
					<li>
						<button
							type="button"
							class="resource-option"
							data-testid="resource-option"
							[attr.aria-pressed]="resource.resourceName === store.resourceName()"
							(click)="store.selectResource(resource.resourceName)"
						>
							{{ resource.resourceName }}
						</button>
					</li>
				}
			</ul>

			@if (store.resourceName()) {
				<pokedex-filter-group
					[group]="store.filter()"
					[catalog]="catalog()"
					[rootTypeName]="currentTypeName()"
					(groupPatched)="handleGroupPatched($event)"
					(addRuleRequested)="store.addRule($event)"
					(addGroupRequested)="store.addGroup($event)"
					(removeNodeRequested)="store.removeNode($event)"
					(ruleChanged)="handleRuleChanged($event)"
				/>

				<pokedex-selection-editor [resourceName]="store.resourceName()" [selection]="store.selection()" (selectionChanged)="store.setSelection($event)" />

				<pokedex-query-preview [compileResult]="store.compileResult()" />
			}
		</div>
	`,
	styles: `
		:host { display: block; }
		.query-builder { display: flex; flex-direction: column; gap: var(--s-3); }
		.resource-list { display: flex; flex-wrap: wrap; gap: var(--s-1); list-style: none; margin: 0; padding: 0; }
		.resource-option {
			font-size: var(--fs-sm);
			padding: var(--s-1) var(--s-3);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink-muted);
			cursor: pointer;
		}
		.resource-option[aria-pressed='true'] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
		.resource-option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	`,
})
export class QueryBuilderComponent {
	readonly resources = input.required<readonly ResourceDescriptor[]>();
	readonly catalog = input.required<QueryBuilderCatalog>();
	readonly compiled = output<CompiledQuery>();

	protected readonly store = inject(QueryBuilderStore);

	protected readonly currentTypeName = computed(
		() => this.resources().find((resource) => resource.resourceName === this.store.resourceName())?.booleanExpressionTypeName ?? '',
	);

	constructor() {
		effect(() => {
			const result = this.store.compileResult();
			if (result.status === 'complete') {
				this.compiled.emit({ document: result.document, variables: result.variables });
			}
		});
	}

	protected handleGroupPatched(patch: FilterGroupPatch): void {
		if (patch.combinator !== undefined) this.store.setCombinator(patch.nodeId, patch.combinator);
		if (patch.negated !== undefined) this.store.toggleNegated(patch.nodeId);
		if ('relationScope' in patch) this.store.setRelationScope(patch.nodeId, patch.relationScope ?? null);
	}

	protected handleRuleChanged(rule: FilterRule): void {
		const current = findNode(this.store.filter(), rule.nodeId);
		if (current !== null && current.kind === 'rule' && JSON.stringify(current) === JSON.stringify(rule)) return;
		this.store.updateRule(rule.nodeId, rule);
	}
}
