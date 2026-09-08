import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { compileQuery } from '../core/compiler/compile-query';
import type { SelectionNode } from '../core/compiler/build-selection';
import { hasuraDialect } from '../core/dialect/hasura-dialect';
import type { LiteralValue } from '../core/model/literal-value';
import {
	createFilterGroup,
	createFilterRule,
	isFilterGroup,
	type FieldOrdering,
	type FilterGroup,
	type FilterRule,
	type QueryBuilderNode,
	type RelationScope,
} from '../core/model/query-tree';

interface QueryBuilderState {
	readonly resourceName: string;
	readonly filter: FilterGroup;
	readonly selection: SelectionNode;
	readonly ordering: readonly FieldOrdering[];
	readonly limit: number;
	readonly resolvedValues: ReadonlyMap<string, LiteralValue>;
	readonly variableTypeNames: ReadonlyMap<string, string>;
	readonly comparisonTypeNames: ReadonlyMap<string, string>;
}

function createInitialState(): QueryBuilderState {
	return {
		resourceName: '',
		filter: createFilterGroup(),
		selection: { fieldName: '', children: [] },
		ordering: [{ fieldPath: ['id'], direction: 'asc' }],
		limit: 50,
		resolvedValues: new Map(),
		variableTypeNames: new Map(),
		comparisonTypeNames: new Map(),
	};
}

function replaceNode(root: FilterGroup, nodeId: string, replacer: (node: QueryBuilderNode) => QueryBuilderNode | null): FilterGroup {
	function visitGroup(group: FilterGroup): FilterGroup {
		if (group.nodeId === nodeId) {
			const replaced = replacer(group);
			if (replaced === null || !isFilterGroup(replaced)) {
				return group;
			}
			return replaced;
		}

		let childrenChanged = false;
		const children: QueryBuilderNode[] = [];
		for (const child of group.children) {
			if (child.nodeId === nodeId) {
				const replaced = replacer(child);
				childrenChanged = true;
				if (replaced !== null) {
					children.push(replaced);
				}
				continue;
			}
			if (isFilterGroup(child)) {
				const visitedChild = visitGroup(child);
				if (visitedChild !== child) {
					childrenChanged = true;
				}
				children.push(visitedChild);
				continue;
			}
			children.push(child);
		}

		if (!childrenChanged) {
			return group;
		}
		return { ...group, children };
	}

	return visitGroup(root);
}

export const QueryBuilderStore = signalStore(
	withState<QueryBuilderState>(createInitialState()),
	withComputed((store) => ({
		compileResult: computed(() =>
			compileQuery(
				{
					resourceName: store.resourceName(),
					filter: store.filter(),
					selection: store.selection(),
					ordering: store.ordering(),
					limit: store.limit(),
					resolvedValues: store.resolvedValues(),
					variableTypeNames: store.variableTypeNames(),
				},
				hasuraDialect,
			),
		),
	})),
	withMethods((store) => ({
		selectResource(resourceName: string): void {
			patchState(store, { resourceName, filter: createFilterGroup() });
		},
		addRule(parentGroupNodeId: string): void {
			patchState(store, {
				filter: replaceNode(store.filter(), parentGroupNodeId, (node) => {
					if (!isFilterGroup(node)) {
						return node;
					}
					return { ...node, children: [...node.children, createFilterRule()] };
				}),
			});
		},
		addGroup(parentGroupNodeId: string): void {
			patchState(store, {
				filter: replaceNode(store.filter(), parentGroupNodeId, (node) => {
					if (!isFilterGroup(node)) {
						return node;
					}
					return { ...node, children: [...node.children, createFilterGroup()] };
				}),
			});
		},
		updateRule(ruleNodeId: string, changes: Partial<Omit<FilterRule, 'kind' | 'nodeId'>>): void {
			patchState(store, {
				filter: replaceNode(store.filter(), ruleNodeId, (node) => {
					if (node.kind !== 'rule') {
						return node;
					}
					return { ...node, ...changes };
				}),
			});
		},
		removeNode(nodeId: string): void {
			patchState(store, { filter: replaceNode(store.filter(), nodeId, () => null) });
		},
		setCombinator(groupNodeId: string, combinator: FilterGroup['combinator']): void {
			patchState(store, {
				filter: replaceNode(store.filter(), groupNodeId, (node) => {
					if (!isFilterGroup(node)) {
						return node;
					}
					return { ...node, combinator };
				}),
			});
		},
		toggleNegated(groupNodeId: string): void {
			patchState(store, {
				filter: replaceNode(store.filter(), groupNodeId, (node) => {
					if (!isFilterGroup(node)) {
						return node;
					}
					return { ...node, negated: !node.negated };
				}),
			});
		},
		setRelationScope(groupNodeId: string, relationScope: RelationScope | null): void {
			patchState(store, {
				filter: replaceNode(store.filter(), groupNodeId, (node) => {
					if (!isFilterGroup(node)) {
						return node;
					}
					return { ...node, relationScope };
				}),
			});
		},
		setResolvedValue(variableName: string, value: LiteralValue, variableTypeName: string): void {
			const resolvedValues = new Map(store.resolvedValues());
			resolvedValues.set(variableName, value);
			const variableTypeNames = new Map(store.variableTypeNames());
			variableTypeNames.set(variableName, variableTypeName);
			patchState(store, { resolvedValues, variableTypeNames });
		},
		setComparisonTypeName(ruleNodeId: string, comparisonTypeName: string): void {
			const comparisonTypeNames = new Map(store.comparisonTypeNames());
			comparisonTypeNames.set(ruleNodeId, comparisonTypeName);
			patchState(store, { comparisonTypeNames });
		},
		setSelection(selection: SelectionNode): void {
			patchState(store, { selection });
		},
		setLimit(limit: number): void {
			patchState(store, { limit });
		},
	})),
);
