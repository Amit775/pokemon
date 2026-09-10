import { createFilterGroup, createFilterRule, type QueryBuilderNode } from '../core/model/query-tree';
import type { FilterShortcut } from './query-builder-metadata';

const defaultOperatorName = '_eq';

export function expandShortcut(shortcut: FilterShortcut): QueryBuilderNode {
	const editableRule = createFilterRule({
		fieldPath: shortcut.fieldPath,
		operatorName: defaultOperatorName,
		operand: { source: 'literal', value: null },
	});

	if (!shortcut.scope) return editableRule;

	const pinnedRules = shortcut.scope.pinnedRules.map((pinnedRule) =>
		createFilterRule({
			fieldPath: pinnedRule.fieldPath,
			operatorName: pinnedRule.operatorName,
			operand: { source: 'literal', value: pinnedRule.value },
			pinned: true,
		}),
	);

	return createFilterGroup({
		relationScope: { fieldPath: shortcut.scope.relationPath, quantifier: shortcut.scope.quantifier },
		children: [...pinnedRules, editableRule],
	});
}
