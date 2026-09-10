import type { LiteralValue } from './literal-value';

export type CombinatorName = 'and' | 'or';
export type RelationQuantifier = 'some' | 'none';
export type SortDirection = 'asc' | 'desc';
export type AggregateFunctionName = 'avg' | 'max' | 'min' | 'sum' | 'count' | 'stddev' | 'variance';

export interface FieldOrdering {
	readonly fieldPath: readonly string[];
	readonly direction: SortDirection;
}

export interface RelationScope {
	readonly fieldPath: readonly string[];
	readonly quantifier: RelationQuantifier;
}

export type ScalarSelector =
	| { readonly kind: 'row'; readonly fieldPath: readonly string[]; readonly ordering: FieldOrdering | null }
	| { readonly kind: 'aggregate'; readonly functionName: AggregateFunctionName; readonly fieldPath: readonly string[] };

export interface ScalarSubquery {
	readonly resourceName: string;
	readonly filter: FilterGroup | null;
	readonly selector: ScalarSelector;
}

export type FilterOperand =
	| { readonly source: 'literal'; readonly value: LiteralValue }
	| { readonly source: 'subquery'; readonly subquery: ScalarSubquery };

export interface FilterGroup {
	readonly kind: 'group';
	readonly nodeId: string;
	readonly combinator: CombinatorName;
	readonly negated: boolean;
	readonly relationScope: RelationScope | null;
	readonly children: readonly QueryBuilderNode[];
}

export interface FilterRule {
	readonly kind: 'rule';
	readonly nodeId: string;
	readonly fieldPath: readonly string[];
	readonly operatorName: string;
	readonly operand: FilterOperand;
	readonly pinned?: boolean;
}

export type QueryBuilderNode = FilterGroup | FilterRule;

let nodeCounter = 0;

function nextNodeId(prefix: string): string {
	nodeCounter += 1;
	return `${prefix}-${nodeCounter}`;
}

export function createFilterGroup(overrides: Partial<Omit<FilterGroup, 'kind' | 'nodeId'>> = {}): FilterGroup {
	return {
		kind: 'group',
		nodeId: nextNodeId('group'),
		combinator: overrides.combinator ?? 'and',
		negated: overrides.negated ?? false,
		relationScope: overrides.relationScope ?? null,
		children: overrides.children ?? [],
	};
}

export function createFilterRule(overrides: Partial<Omit<FilterRule, 'kind' | 'nodeId'>> = {}): FilterRule {
	return {
		kind: 'rule',
		nodeId: nextNodeId('rule'),
		fieldPath: overrides.fieldPath ?? [],
		operatorName: overrides.operatorName ?? '',
		operand: overrides.operand ?? { source: 'literal', value: null },
		...(overrides.pinned !== undefined ? { pinned: overrides.pinned } : {}),
	};
}

export function isFilterGroup(node: QueryBuilderNode): node is FilterGroup {
	return node.kind === 'group';
}

export function isFilterRule(node: QueryBuilderNode): node is FilterRule {
	return node.kind === 'rule';
}
