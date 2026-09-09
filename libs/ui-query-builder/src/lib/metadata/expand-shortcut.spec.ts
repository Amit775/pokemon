import { expandShortcut } from './expand-shortcut';
import { isFilterGroup, isFilterRule } from '../core/model/query-tree';
import type { FilterShortcut } from './query-builder-metadata';

const typeShortcut: FilterShortcut = {
	shortcutId: 'type',
	displayName: 'Type',
	fieldPath: ['pokemontypes', 'type', 'name'],
	valueSource: { resourceName: 'type', valueFieldName: 'name' },
};

const baseSpeedShortcut: FilterShortcut = {
	shortcutId: 'baseSpeed',
	displayName: 'Base Speed',
	fieldPath: ['base_stat'],
	scope: {
		relationPath: ['pokemonstats'],
		quantifier: 'some',
		pinnedRules: [{ fieldPath: ['stat', 'name'], operatorName: '_eq', value: 'speed' }],
	},
};

describe('expandShortcut', () => {
	it('expands an unscoped shortcut into a single rule on its field path', () => {
		const node = expandShortcut(typeShortcut);

		expect(isFilterRule(node)).toBe(true);
		if (!isFilterRule(node)) return;
		expect(node.fieldPath).toEqual(['pokemontypes', 'type', 'name']);
		expect(node.operatorName).toBe('_eq');
	});

	it('expands a scoped shortcut into a relation-scoped group', () => {
		const node = expandShortcut(baseSpeedShortcut);

		expect(isFilterGroup(node)).toBe(true);
		if (!isFilterGroup(node)) return;
		expect(node.relationScope).toEqual({ fieldPath: ['pokemonstats'], quantifier: 'some' });
		expect(node.children).toHaveLength(2);
	});

	it('puts the pinned condition first and the editable rule last', () => {
		const node = expandShortcut(baseSpeedShortcut);
		if (!isFilterGroup(node)) throw new Error('expected a group');

		const [pinned, editable] = node.children;
		if (!isFilterRule(pinned) || !isFilterRule(editable)) throw new Error('expected two rules');

		expect(pinned.fieldPath).toEqual(['stat', 'name']);
		expect(pinned.operand).toEqual({ source: 'literal', value: 'speed' });
		expect(editable.fieldPath).toEqual(['base_stat']);
		expect(editable.operand).toEqual({ source: 'literal', value: null });
	});

	it('gives every expansion fresh node identifiers', () => {
		const first = expandShortcut(baseSpeedShortcut);
		const second = expandShortcut(baseSpeedShortcut);

		expect(first.nodeId).not.toBe(second.nodeId);
	});
});
