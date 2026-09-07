import { Kind, type ListValueNode, type ObjectValueNode, type ValueNode, type VariableNode } from 'graphql';
import type { FieldOrdering } from '../model/query-tree';
import type { LiteralScalar, LiteralValue } from '../model/literal-value';

function scalarValueNode(value: LiteralScalar): ValueNode {
	if (value === null) return { kind: Kind.NULL };
	if (typeof value === 'boolean') return { kind: Kind.BOOLEAN, value };
	if (typeof value === 'number') {
		return Number.isInteger(value) ? { kind: Kind.INT, value: String(value) } : { kind: Kind.FLOAT, value: String(value) };
	}
	return { kind: Kind.STRING, value };
}

export function literalValueNode(value: LiteralValue): ValueNode {
	if (Array.isArray(value)) {
		return { kind: Kind.LIST, values: value.map(scalarValueNode) };
	}
	return scalarValueNode(value as LiteralScalar);
}

export function variableValueNode(variableName: string): VariableNode {
	return { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: variableName } };
}

export function enumValueNode(value: string): ValueNode {
	return { kind: Kind.ENUM, value };
}

export function objectValueNode(fields: readonly (readonly [string, ValueNode])[]): ObjectValueNode {
	return {
		kind: Kind.OBJECT,
		fields: fields.map(([fieldName, value]) => ({
			kind: Kind.OBJECT_FIELD,
			name: { kind: Kind.NAME, value: fieldName },
			value,
		})),
	};
}

export function listValueNode(values: readonly ValueNode[]): ListValueNode {
	return { kind: Kind.LIST, values: [...values] };
}

export function orderingValueNode(ordering: FieldOrdering): ValueNode {
	return ordering.fieldPath.reduceRight<ValueNode>(
		(accumulated, fieldName) => objectValueNode([[fieldName, accumulated]]),
		enumValueNode(ordering.direction),
	);
}
