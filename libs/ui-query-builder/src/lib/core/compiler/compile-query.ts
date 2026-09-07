import { Kind, print, type ArgumentNode, type VariableDefinitionNode } from 'graphql';
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import { coerceToGraphQLType, type LiteralValue } from '../model/literal-value';
import { isFilterGroup, type FieldOrdering, type FilterGroup, type QueryBuilderNode } from '../model/query-tree';
import { buildSelectionSet, type SelectionNode } from './build-selection';
import { buildWhereValueNode } from './build-where';
import { collectSubqueries } from './collect-subqueries';
import { listValueNode, literalValueNode, orderingValueNode } from './value-nodes';

export interface CompileRequest {
	readonly resourceName: string;
	readonly filter: FilterGroup;
	readonly selection: SelectionNode;
	readonly ordering: readonly FieldOrdering[];
	readonly limit: number;
	readonly resolvedValues: ReadonlyMap<string, LiteralValue>;
	readonly variableTypeNames: ReadonlyMap<string, string>;
}

export type CompileIssueReason = 'incompleteRule' | 'unresolvedSubquery' | 'emptySelection' | 'emptyFilter';

export interface CompileIssue {
	readonly nodeId: string | null;
	readonly reason: CompileIssueReason;
	readonly message: string;
}

export type CompileResult =
	| { readonly status: 'complete'; readonly document: string; readonly variables: Record<string, unknown> }
	| { readonly status: 'incomplete'; readonly issues: readonly CompileIssue[] };

function nameNode(value: string) {
	return { kind: Kind.NAME, value } as const;
}

function collectRuleIssues(group: FilterGroup): CompileIssue[] {
	const issues: CompileIssue[] = [];

	function visit(node: QueryBuilderNode): void {
		if (isFilterGroup(node)) {
			node.children.forEach(visit);
			return;
		}
		if (node.fieldPath.length === 0 || node.operatorName === '') {
			issues.push({ nodeId: node.nodeId, reason: 'incompleteRule', message: 'This rule needs both a field and an operator.' });
		}
	}

	visit(group);
	return issues;
}

function inferVariableTypeName(value: LiteralValue): string {
	if (typeof value === 'boolean') return 'Boolean';
	if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Float';
	return 'String';
}

export function compileQuery(request: CompileRequest, dialect: QueryBuilderDialect): CompileResult {
	const issues: CompileIssue[] = collectRuleIssues(request.filter);

	if (request.selection.children.length === 0) {
		issues.push({ nodeId: null, reason: 'emptySelection', message: 'Choose at least one field to return.' });
	}

	const collected = collectSubqueries(request.filter);
	const variableNameByNodeId = new Map<string, string>();
	const variables: Record<string, unknown> = {};
	const variableDefinitions: VariableDefinitionNode[] = [];

	for (const entry of collected) {
		if (!request.resolvedValues.has(entry.variableName)) {
			for (const nodeId of entry.nodeIds) {
				issues.push({ nodeId, reason: 'unresolvedSubquery', message: 'This comparison value has not been resolved yet.' });
			}
			continue;
		}

		const resolved = request.resolvedValues.get(entry.variableName) as LiteralValue;
		const variableTypeName = request.variableTypeNames.get(entry.variableName) ?? inferVariableTypeName(resolved);
		const value = coerceToGraphQLType(resolved, variableTypeName);

		for (const nodeId of entry.nodeIds) {
			variableNameByNodeId.set(nodeId, entry.variableName);
		}
		variables[entry.variableName] = value;
		variableDefinitions.push({
			kind: Kind.VARIABLE_DEFINITION,
			variable: { kind: Kind.VARIABLE, name: nameNode(entry.variableName) },
			type: { kind: Kind.NON_NULL_TYPE, type: { kind: Kind.NAMED_TYPE, name: nameNode(variableTypeName) } },
		});
	}

	if (issues.length > 0) {
		return { status: 'incomplete', issues };
	}

	const argumentNodes: ArgumentNode[] = [
		{ kind: Kind.ARGUMENT, name: nameNode('where'), value: buildWhereValueNode(request.filter, dialect, variableNameByNodeId) },
	];

	if (request.ordering.length > 0) {
		const orderingNodes = request.ordering.map(orderingValueNode);
		argumentNodes.push({
			kind: Kind.ARGUMENT,
			name: nameNode('order_by'),
			value: orderingNodes.length === 1 ? orderingNodes[0] : listValueNode(orderingNodes),
		});
	}

	argumentNodes.push({ kind: Kind.ARGUMENT, name: nameNode('limit'), value: literalValueNode(request.limit) });

	const document = print({
		kind: Kind.DOCUMENT,
		definitions: [
			{
				kind: Kind.OPERATION_DEFINITION,
				operation: 'query' as const,
				name: nameNode('BuiltQuery'),
				...(variableDefinitions.length > 0 ? { variableDefinitions } : {}),
				selectionSet: {
					kind: Kind.SELECTION_SET,
					selections: [
						{
							kind: Kind.FIELD,
							name: nameNode(request.resourceName),
							arguments: argumentNodes,
							selectionSet: buildSelectionSet(request.selection),
						},
					],
				},
			},
		],
	});

	return { status: 'complete', document, variables };
}
