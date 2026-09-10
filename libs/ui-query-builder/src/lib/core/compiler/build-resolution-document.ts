import { Kind, OperationTypeNode, print, type ArgumentNode, type FieldNode, type SelectionSetNode, type ValueNode } from 'graphql';
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { FieldOrdering } from '../model/query-tree';
import { buildWhereValueNode } from './build-where';
import type { CollectedSubquery } from './collect-subqueries';
import { literalValueNode, orderingValueNode } from './value-nodes';

const defaultOrdering: FieldOrdering = { fieldPath: ['id'], direction: 'asc' };

function nameNode(value: string) {
	return { kind: Kind.NAME, value } as const;
}

function fieldNode(fieldName: string, selections: readonly FieldNode[] = [], alias?: string, argumentNodes: readonly ArgumentNode[] = []): FieldNode {
	return {
		kind: Kind.FIELD,
		name: nameNode(fieldName),
		...(alias ? { alias: nameNode(alias) } : {}),
		...(argumentNodes.length > 0 ? { arguments: [...argumentNodes] } : {}),
		...(selections.length > 0 ? { selectionSet: { kind: Kind.SELECTION_SET, selections: [...selections] } as SelectionSetNode } : {}),
	};
}

function argumentNode(argumentName: string, value: ValueNode): ArgumentNode {
	return { kind: Kind.ARGUMENT, name: nameNode(argumentName), value };
}

function nestSelection(fieldPath: readonly string[]): FieldNode {
	const [head, ...rest] = fieldPath;
	return rest.length === 0 ? fieldNode(head) : fieldNode(head, [nestSelection(rest)]);
}

function buildSubqueryField(collected: CollectedSubquery, dialect: QueryBuilderDialect): FieldNode {
	const { subquery, variableName } = collected;
	const argumentNodes: ArgumentNode[] = [];

	if (subquery.filter) {
		argumentNodes.push(argumentNode('where', buildWhereValueNode(subquery.filter, dialect, new Map())));
	}

	if (subquery.selector.kind === 'aggregate') {
		const aggregateSelection =
			subquery.selector.functionName === 'count'
				? fieldNode('count')
				: fieldNode(subquery.selector.functionName, [nestSelection(subquery.selector.fieldPath)]);

		return fieldNode(`${subquery.resourceName}_aggregate`, [fieldNode('aggregate', [aggregateSelection])], variableName, argumentNodes);
	}

	const ordering = subquery.selector.ordering ?? defaultOrdering;
	argumentNodes.push(argumentNode('order_by', orderingValueNode(ordering)));
	argumentNodes.push(argumentNode('limit', literalValueNode(1)));

	return fieldNode(subquery.resourceName, [nestSelection(subquery.selector.fieldPath)], variableName, argumentNodes);
}

export function buildResolutionDocument(collected: readonly CollectedSubquery[], dialect: QueryBuilderDialect): string {
	if (collected.length === 0) return '';

	return print({
		kind: Kind.DOCUMENT,
		definitions: [
			{
				kind: Kind.OPERATION_DEFINITION,
				operation: OperationTypeNode.QUERY,
				name: nameNode('ResolveOperands'),
				selectionSet: {
					kind: Kind.SELECTION_SET,
					selections: collected.map((entry) => buildSubqueryField(entry, dialect)),
				},
			},
		],
	});
}
