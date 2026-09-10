import { print } from 'graphql';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule } from '../model/query-tree';
import { buildWhereValueNode } from './build-where';
import { orderingValueNode } from './value-nodes';

function printWhere(group: Parameters<typeof buildWhereValueNode>[0], variableNameByNodeId = new Map<string, string>()) {
	return print(buildWhereValueNode(group, hasuraDialect, variableNameByNodeId)).replace(/\s+/g, ' ');
}

describe('buildWhereValueNode', () => {
	it('nests a rule along its field path', () => {
		const group = createFilterGroup({
			children: [
				createFilterRule({
					fieldPath: ['pokemontypes', 'type', 'name'],
					operatorName: '_eq',
					operand: { source: 'literal', value: 'grass' },
				}),
			],
		});

		expect(printWhere(group)).toBe('{_and: [{pokemontypes: {type: {name: {_eq: "grass"}}}}]}');
	});

	it('uses the or combinator when the group asks for it', () => {
		const group = createFilterGroup({
			combinator: 'or',
			children: [
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'pikachu' } }),
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'raichu' } }),
			],
		});

		expect(printWhere(group)).toBe('{_or: [{name: {_eq: "pikachu"}}, {name: {_eq: "raichu"}}]}');
	});

	it('wraps a negated group in _not', () => {
		const group = createFilterGroup({
			negated: true,
			children: [createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'ditto' } })],
		});

		expect(printWhere(group)).toBe('{_not: {_and: [{name: {_eq: "ditto"}}]}}');
	});

	it('compiles a relation-scoped group so its children share one related row', () => {
		const group = createFilterGroup({
			relationScope: { fieldPath: ['pokemonstats'], quantifier: 'some' },
			children: [
				createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
				createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'literal', value: 30 } }),
			],
		});

		expect(printWhere(group)).toBe('{pokemonstats: {_and: [{stat: {name: {_eq: "speed"}}}, {base_stat: {_gt: 30}}]}}');
	});

	it('compiles a none-quantified relation scope as a negated relation', () => {
		const group = createFilterGroup({
			relationScope: { fieldPath: ['pokemonmoves'], quantifier: 'none' },
			children: [createFilterRule({ fieldPath: ['move', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'splash' } })],
		});

		expect(printWhere(group)).toBe('{_not: {pokemonmoves: {_and: [{move: {name: {_eq: "splash"}}}]}}}');
	});

	it('emits a list value for list operators', () => {
		const group = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['name'], operatorName: '_in', operand: { source: 'literal', value: ['grass', 'fire'] } })],
		});

		expect(printWhere(group)).toBe('{_and: [{name: {_in: ["grass", "fire"]}}]}');
	});

	it('emits a variable reference for a subquery operand', () => {
		const rule = createFilterRule({
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: { resourceName: 'pokemonstat', filter: null, selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null } },
			},
		});
		const group = createFilterGroup({ children: [rule] });

		expect(printWhere(group, new Map([[rule.nodeId, 'snorlaxSpeed']]))).toBe('{_and: [{base_stat: {_gt: $snorlaxSpeed}}]}');
	});

	it('drops an empty group so a blank builder does not emit a broken filter', () => {
		expect(printWhere(createFilterGroup())).toBe('{}');
	});

	it('compiles a pinned rule identically to an otherwise-identical unpinned rule', () => {
		const pinnedGroup = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' }, pinned: true })],
		});
		const unpinnedGroup = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } })],
		});

		expect(printWhere(pinnedGroup)).toBe(printWhere(unpinnedGroup));
	});
});

describe('orderingValueNode', () => {
	it('prints a single-field ordering as an unquoted enum value', () => {
		expect(print(orderingValueNode({ fieldPath: ['id'], direction: 'asc' })).replace(/\s+/g, ' ')).toBe('{id: asc}');
	});

	it('nests a multi-segment field path', () => {
		expect(print(orderingValueNode({ fieldPath: ['pokemon', 'name'], direction: 'desc' })).replace(/\s+/g, ' ')).toBe('{pokemon: {name: desc}}');
	});
});
