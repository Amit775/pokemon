import { createFilterGroup, createFilterRule, isFilterGroup, isFilterRule } from './query-tree';

describe('query tree factories', () => {
	it('creates a group that defaults to AND, not negated and unscoped', () => {
		const group = createFilterGroup();

		expect(group.kind).toBe('group');
		expect(group.combinator).toBe('and');
		expect(group.negated).toBe(false);
		expect(group.relationScope).toBeNull();
		expect(group.children).toEqual([]);
	});

	it('gives every node a distinct identifier', () => {
		const first = createFilterGroup();
		const second = createFilterGroup();

		expect(first.nodeId).not.toBe(second.nodeId);
	});

	it('creates a rule carrying a literal operand', () => {
		const rule = createFilterRule({
			fieldPath: ['pokemontypes', 'type', 'name'],
			operatorName: '_eq',
			operand: { source: 'literal', value: 'grass' },
		});

		expect(rule.kind).toBe('rule');
		expect(rule.fieldPath).toEqual(['pokemontypes', 'type', 'name']);
		expect(rule.operand).toEqual({ source: 'literal', value: 'grass' });
	});

	it('narrows nodes by kind', () => {
		const group = createFilterGroup();
		const rule = createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'pikachu' } });

		expect(isFilterGroup(group)).toBe(true);
		expect(isFilterGroup(rule)).toBe(false);
		expect(isFilterRule(rule)).toBe(true);
	});
});
