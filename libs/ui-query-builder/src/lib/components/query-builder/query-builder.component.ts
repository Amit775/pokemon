import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { SearchSelectComponent, type SearchSelectOption } from '@pokemon-center/ui-pokedex';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import { isFilterGroup, type FilterGroup, type FilterRule, type QueryBuilderNode } from '../../core/model/query-tree';
import type { ResourceDescriptor } from '../../core/metadata/read-resources';
import { QUERY_BUILDER_METADATA } from '../../metadata/query-builder-metadata';
import { resolveResourceLabel } from '../../metadata/resolve-labels';
import { QueryBuilderStore } from '../../session/query-builder.store';
import { FilterGroupComponent, type FilterGroupPatch, type FilterShortcutChoice } from '../filter-group/filter-group.component';
import { QueryPreviewComponent } from '../query-preview/query-preview.component';
import { SelectionEditorComponent } from '../selection-editor/selection-editor.component';

export interface CompiledQuery {
	readonly document: string;
	readonly variables: Record<string, unknown>;
}

const RESOURCE_GROUP_ORDER = ['Core', 'Classification', 'World', 'Mechanics', 'Everything else'] as const;
const UNCURATED_RESOURCE_GROUP_NAME = 'Everything else';

function resourceGroupOrderIndex(groupName: string): number {
	const index = RESOURCE_GROUP_ORDER.indexOf(groupName as (typeof RESOURCE_GROUP_ORDER)[number]);
	return index === -1 ? RESOURCE_GROUP_ORDER.length : index;
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
	imports: [FilterGroupComponent, SelectionEditorComponent, QueryPreviewComponent, SearchSelectComponent],
	template: `
		<div class="query-builder">
			<div class="resource-picker" data-testid="resource-select">
				<pokedex-search-select
					[options]="resourceOptions()"
					[value]="store.resourceName() || null"
					placeholder="Choose a resource"
					(valueChosen)="store.selectResource($event)"
				/>
			</div>

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
					(shortcutChosen)="handleShortcutChosen($event)"
				/>

				<pokedex-selection-editor [resourceName]="store.resourceName()" [selection]="store.selection()" (selectionChanged)="store.setSelection($event)" />

				<pokedex-query-preview [compileResult]="store.compileResult()" />
			}
		</div>
	`,
	styles: `
		:host { display: block; }
		.query-builder { display: flex; flex-direction: column; gap: var(--s-3); }
		.resource-picker { display: flex; }
	`,
})
export class QueryBuilderComponent {
	readonly resources = input.required<readonly ResourceDescriptor[]>();
	readonly catalog = input.required<QueryBuilderCatalog>();
	readonly compiled = output<CompiledQuery>();

	protected readonly store = inject(QueryBuilderStore);
	private readonly metadata = inject(QUERY_BUILDER_METADATA);

	protected readonly currentTypeName = computed(
		() => this.resources().find((resource) => resource.resourceName === this.store.resourceName())?.booleanExpressionTypeName ?? '',
	);

	protected readonly resourceOptions = computed<readonly SearchSelectOption[]>(() => {
		const metadata = this.metadata;

		return this.resources()
			.map((resource) => {
				const curatedResource = metadata.resources.find((entry) => entry.resourceName === resource.resourceName);
				return {
					value: resource.resourceName,
					label: resolveResourceLabel(metadata, resource.resourceName),
					group: curatedResource?.group ?? UNCURATED_RESOURCE_GROUP_NAME,
					priority: curatedResource?.priority ?? 0,
				};
			})
			.sort((first, second) => {
				const groupOrderDifference = resourceGroupOrderIndex(first.group) - resourceGroupOrderIndex(second.group);
				if (groupOrderDifference !== 0) return groupOrderDifference;

				const priorityDifference = second.priority - first.priority;
				if (priorityDifference !== 0) return priorityDifference;

				return first.label.localeCompare(second.label);
			})
			.map(({ value, label, group }) => ({ value, label, group }));
	});

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

	protected handleShortcutChosen(choice: FilterShortcutChoice): void {
		this.store.replaceNode(choice.nodeId, choice.replacement);
	}
}
