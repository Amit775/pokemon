import type { ObjectValueNode, ValueNode } from 'graphql';
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import { isFilterGroup, type FilterGroup, type FilterRule, type QueryBuilderNode } from '../model/query-tree';
import { literalValueNode, listValueNode, objectValueNode, variableValueNode } from './value-nodes';

export type VariableNameByNodeId = ReadonlyMap<string, string>;

function nestAlongPath(fieldPath: readonly string[], leaf: ValueNode): ValueNode {
	return fieldPath.reduceRight<ValueNode>((accumulated, fieldName) => objectValueNode([[fieldName, accumulated]]), leaf);
}

function buildRuleValueNode(rule: FilterRule, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode | null {
	if (rule.fieldPath.length === 0 || rule.operatorName === '') return null;

	let operandNode: ValueNode;
	if (rule.operand.source === 'subquery') {
		const variableName = variableNameByNodeId.get(rule.nodeId);
		if (!variableName) return null;
		operandNode = variableValueNode(variableName);
	} else {
		operandNode = literalValueNode(rule.operand.value);
	}

	const comparison = objectValueNode([[rule.operatorName, operandNode]]);
	return nestAlongPath(rule.fieldPath, comparison) as ObjectValueNode;
}

function buildNodeValueNode(node: QueryBuilderNode, dialect: QueryBuilderDialect, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode | null {
	return isFilterGroup(node) ? buildGroupValueNode(node, dialect, variableNameByNodeId) : buildRuleValueNode(node, variableNameByNodeId);
}

function buildGroupValueNode(group: FilterGroup, dialect: QueryBuilderDialect, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode | null {
	const childNodes = group.children
		.map((child) => buildNodeValueNode(child, dialect, variableNameByNodeId))
		.filter((child): child is ObjectValueNode => child !== null);

	if (childNodes.length === 0) return null;

	const combinatorFieldName = dialect.combinatorFieldNames[group.combinator];
	let result: ObjectValueNode = objectValueNode([[combinatorFieldName, listValueNode(childNodes)]]);

	if (group.relationScope) {
		result = nestAlongPath(group.relationScope.fieldPath, result) as ObjectValueNode;
		if (group.relationScope.quantifier === 'none') {
			result = objectValueNode([[dialect.negationFieldName, result]]);
		}
	}

	if (group.negated) {
		result = objectValueNode([[dialect.negationFieldName, result]]);
	}

	return result;
}

export function buildWhereValueNode(group: FilterGroup, dialect: QueryBuilderDialect, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode {
	return buildGroupValueNode(group, dialect, variableNameByNodeId) ?? objectValueNode([]);
}
