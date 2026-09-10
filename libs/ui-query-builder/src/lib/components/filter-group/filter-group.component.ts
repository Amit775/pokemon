import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { SearchSelectComponent, type SearchSelectOption } from '@pokemon-center/ui-pokedex';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { CatalogFieldDescriptor } from '../../core/metadata/introspection-types';
import {
	isFilterGroup,
	isFilterRule,
	type CombinatorName,
	type FilterGroup,
	type FilterRule,
	type QueryBuilderNode,
	type RelationQuantifier,
	type RelationScope,
} from '../../core/model/query-tree';
import { QUERY_BUILDER_METADATA } from '../../metadata/query-builder-metadata';
import { resolveFieldLabel } from '../../metadata/resolve-labels';
import { QueryBuilderStore } from '../../session/query-builder.store';
import { FilterRuleComponent } from '../filter-rule/filter-rule.component';

const boolExpSuffixPattern = /_bool_exp$/;

const clearRelationScopeValue = '__no_relation_scope__';

function resourceNameFromTypeName(typeName: string): string {
	return typeName.replace(boolExpSuffixPattern, '');
}

export interface FilterGroupPatch {
	readonly nodeId: string;
	readonly combinator?: CombinatorName;
	readonly negated?: boolean;
	readonly relationScope?: RelationScope | null;
}

export interface FilterShortcutChoice {
	readonly nodeId: string;
	readonly replacement: QueryBuilderNode;
}

const emptyQueryBuilderCatalog: QueryBuilderCatalog = {
	readBooleanExpressionFields: async () => [],
	readOperatorsForComparisonType: async () => [],
	readOutputObjectFields: async () => [],
};

async function resolveRelationTypeName(catalog: QueryBuilderCatalog, startTypeName: string, fieldPath: readonly string[]): Promise<string> {
	let currentTypeName = startTypeName;
	for (const fieldName of fieldPath) {
		const fields = await catalog.readBooleanExpressionFields(currentTypeName);
		const relationField = fields.find((field): field is CatalogFieldDescriptor & { kind: 'relation' } => field.kind === 'relation' && field.fieldName === fieldName);
		if (!relationField) return currentTypeName;
		currentTypeName = relationField.booleanExpressionTypeName;
	}
	return currentTypeName;
}

async function resolveComparisonTypeName(catalog: QueryBuilderCatalog, startTypeName: string, fieldPath: readonly string[]): Promise<string> {
	if (fieldPath.length === 0) return '';
	const parentTypeName = await resolveRelationTypeName(catalog, startTypeName, fieldPath.slice(0, -1));
	const fields = await catalog.readBooleanExpressionFields(parentTypeName);
	const scalarField = fields.find(
		(field): field is CatalogFieldDescriptor & { kind: 'scalar' } => field.kind === 'scalar' && field.fieldName === fieldPath[fieldPath.length - 1],
	);
	return scalarField?.comparisonTypeName ?? '';
}

@Component({
	selector: 'pokedex-filter-group',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkListbox, CdkOption, FilterRuleComponent, FilterGroupComponent, SearchSelectComponent],
	template: `
		<div class="filter-group">
			<div class="controls">
				<ul cdkListbox class="combinator-toggle" aria-label="Combinator" [cdkListboxValue]="[group().combinator]" (cdkListboxValueChange)="setCombinator($event.value[0])">
					<li cdkOption="and" class="combinator-option" data-testid="combinator-and">AND</li>
					<li cdkOption="or" class="combinator-option" data-testid="combinator-or">OR</li>
				</ul>

				<button type="button" class="negate-toggle" data-testid="negate-toggle" [attr.aria-pressed]="group().negated" (click)="toggleNegated()">NOT</button>

				<div class="relation-scope-select" data-testid="relation-scope-select">
					<pokedex-search-select
						[options]="relationScopeOptions()"
						[value]="group().relationScope?.fieldPath?.[0] ?? null"
						placeholder="Relation scope"
						[loading]="relationScopeOptionsLoading()"
						(valueChosen)="setRelationScopeFieldName($event)"
						(click)="onRelationScopeAreaClicked($event)"
					/>
				</div>

				@if (group().relationScope) {
					<ul
						cdkListbox
						class="quantifier-toggle"
						aria-label="Quantifier"
						[cdkListboxValue]="[group().relationScope!.quantifier]"
						(cdkListboxValueChange)="setRelationScopeQuantifier($event.value[0])"
					>
						<li cdkOption="some" data-testid="relation-scope-some">SOME</li>
						<li cdkOption="none" data-testid="relation-scope-none">NONE</li>
					</ul>
				}

				<button type="button" data-testid="add-rule" (click)="addRuleRequested.emit(group().nodeId)">Add rule</button>
				<button type="button" data-testid="add-group" (click)="addGroupRequested.emit(group().nodeId)">Add group</button>
			</div>

			<ul class="children">
				@for (child of group().children; track child.nodeId) {
					<li class="child">
						@if (isFilterRule(child)) {
							<pokedex-filter-rule
								[catalog]="catalog()"
								[rule]="child"
								[comparisonTypeName]="comparisonTypeNames().get(child.nodeId) ?? ''"
								[rootTypeName]="childTypeName()"
								[pinned]="child.pinned ?? false"
								(ruleChange)="ruleChanged.emit($event)"
								(shortcutChosen)="shortcutChosen.emit({ nodeId: child.nodeId, replacement: $event })"
							/>
						}
						@if (isFilterGroup(child)) {
							<pokedex-filter-group
								[group]="child"
								[catalog]="catalog()"
								[rootTypeName]="childTypeName()"
								(groupPatched)="groupPatched.emit($event)"
								(addRuleRequested)="addRuleRequested.emit($event)"
								(addGroupRequested)="addGroupRequested.emit($event)"
								(removeNodeRequested)="removeNodeRequested.emit($event)"
								(ruleChanged)="ruleChanged.emit($event)"
								(shortcutChosen)="shortcutChosen.emit($event)"
							/>
						}
						@if (!isPinnedRule(child)) {
							<button type="button" class="remove-node" data-testid="remove-node" (click)="removeNodeRequested.emit(child.nodeId)">Remove</button>
						}
					</li>
				}
			</ul>
		</div>
	`,
	styles: `
		:host { display: block; }
		.filter-group { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-2); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
		.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1); }
		.combinator-toggle, .quantifier-toggle { display: flex; gap: var(--s-1); list-style: none; margin: 0; padding: 0; }
		.combinator-option, .quantifier-toggle li {
			font-size: var(--fs-xs);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			color: var(--ink-muted);
			cursor: pointer;
		}
		.combinator-option[aria-selected='true'], .quantifier-toggle li[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
		.negate-toggle {
			font-size: var(--fs-xs);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink-muted);
			cursor: pointer;
		}
		.negate-toggle[aria-pressed='true'] { background: var(--crit); color: var(--accent-ink); border-color: var(--crit); }
		.relation-scope-select { display: flex; }
		button:focus-visible, input:focus-visible, li:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
		.children { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
		.child { display: flex; align-items: flex-start; gap: var(--s-2); padding-left: var(--s-3); border-left: 2px solid var(--line); }
		.remove-node { font-size: var(--fs-xs); color: var(--crit); background: none; border: none; cursor: pointer; }
	`,
})
export class FilterGroupComponent {
	readonly group = input.required<FilterGroup>();
	readonly catalog = input<QueryBuilderCatalog>(emptyQueryBuilderCatalog);
	readonly rootTypeName = input<string>('');

	readonly groupPatched = output<FilterGroupPatch>();
	readonly addRuleRequested = output<string>();
	readonly addGroupRequested = output<string>();
	readonly removeNodeRequested = output<string>();
	readonly ruleChanged = output<FilterRule>();
	readonly shortcutChosen = output<FilterShortcutChoice>();

	protected readonly isFilterGroup = isFilterGroup;
	protected readonly isFilterRule = isFilterRule;

	private readonly store = inject(QueryBuilderStore, { optional: true });
	private readonly metadata = inject(QUERY_BUILDER_METADATA);

	protected readonly childTypeName = signal('');
	protected readonly comparisonTypeNames = signal<ReadonlyMap<string, string>>(new Map());

	protected readonly relationScopeOptionsRequested = signal(false);

	private readonly rootTypeFieldsResource = resource({
		params: () => (this.relationScopeOptionsRequested() ? { catalog: this.catalog(), rootTypeName: this.rootTypeName() } : undefined),
		loader: ({ params }) => params.catalog.readBooleanExpressionFields(params.rootTypeName),
		defaultValue: [] as readonly CatalogFieldDescriptor[],
	});

	protected readonly relationScopeOptions = computed<readonly SearchSelectOption[]>(() => {
		const resourceName = resourceNameFromTypeName(this.rootTypeName());
		const relationOptions = this.rootTypeFieldsResource
			.value()
			.filter((field): field is CatalogFieldDescriptor & { kind: 'relation' } => field.kind === 'relation' && field.cardinality === 'toMany')
			.map((field) => ({ value: field.fieldName, label: resolveFieldLabel(this.metadata, resourceName, field.fieldName) }));
		return [{ value: clearRelationScopeValue, label: 'No relation scope' }, ...relationOptions];
	});

	protected readonly relationScopeOptionsLoading = computed(() => this.rootTypeFieldsResource.isLoading());

	constructor() {
		effect(() => {
			const currentGroup = this.group();
			const currentCatalog = this.catalog();
			const currentRootTypeName = this.rootTypeName();
			void this.resolveTypeNames(currentGroup, currentCatalog, currentRootTypeName);
		});
	}

	private async resolveTypeNames(group: FilterGroup, catalog: QueryBuilderCatalog, rootTypeName: string): Promise<void> {
		const childTypeName = group.relationScope ? await resolveRelationTypeName(catalog, rootTypeName, group.relationScope.fieldPath) : rootTypeName;
		this.childTypeName.set(childTypeName);

		const ruleChildren = group.children.filter(isFilterRule);
		const entries = await Promise.all(
			ruleChildren.map(async (rule): Promise<readonly [string, string]> => [rule.nodeId, await resolveComparisonTypeName(catalog, childTypeName, rule.fieldPath)]),
		);
		this.comparisonTypeNames.set(new Map(entries));

		for (const [ruleNodeId, comparisonTypeName] of entries) {
			this.store?.setComparisonTypeName(ruleNodeId, comparisonTypeName);
		}
	}

	protected isPinnedRule(node: QueryBuilderNode): boolean {
		return isFilterRule(node) && node.pinned === true;
	}

	protected onRelationScopeAreaClicked(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.closest('[data-testid="search-select-trigger"]')) return;
		this.relationScopeOptionsRequested.set(true);
	}

	protected setCombinator(combinator: CombinatorName): void {
		this.groupPatched.emit({ nodeId: this.group().nodeId, combinator });
	}

	protected toggleNegated(): void {
		this.groupPatched.emit({ nodeId: this.group().nodeId, negated: !this.group().negated });
	}

	protected setRelationScope(relationScope: RelationScope | null): void {
		this.groupPatched.emit({ nodeId: this.group().nodeId, relationScope });
	}

	protected setRelationScopeFieldName(fieldName: string): void {
		if (fieldName === clearRelationScopeValue) {
			this.setRelationScope(null);
			return;
		}
		const quantifier = this.group().relationScope?.quantifier ?? 'some';
		this.setRelationScope({ fieldPath: [fieldName], quantifier });
	}

	protected setRelationScopeQuantifier(quantifier: RelationQuantifier): void {
		const fieldPath = this.group().relationScope?.fieldPath ?? [];
		if (fieldPath.length > 0) this.setRelationScope({ fieldPath, quantifier });
	}
}
