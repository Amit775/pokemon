import { Kind, type FieldNode, type SelectionSetNode } from 'graphql';

export interface SelectionNode {
	readonly fieldName: string;
	readonly children: readonly SelectionNode[];
}

function toFieldNode(selection: SelectionNode): FieldNode {
	return {
		kind: Kind.FIELD,
		name: { kind: Kind.NAME, value: selection.fieldName },
		...(selection.children.length > 0
			? { selectionSet: { kind: Kind.SELECTION_SET, selections: selection.children.map(toFieldNode) } as SelectionSetNode }
			: {}),
	};
}

export function buildSelectionSet(selection: SelectionNode): SelectionSetNode {
	return { kind: Kind.SELECTION_SET, selections: selection.children.map(toFieldNode) };
}
