import { createFilterGroup, createFilterRule, type ScalarSubquery } from '../model/query-tree';
import { collectSubqueries } from './collect-subqueries';

const snorlaxSpeed: ScalarSubquery = {
	resourceName: 'pokemonstat',
	filter: createFilterGroup({
		children: [
			createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
			createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
		],
	}),
	selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
};

describe('collectSubqueries', () => {
	it('finds a subquery operand and names its variable from resource and field', () => {
		const rule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const collected = collectSubqueries(createFilterGroup({ children: [rule] }));

		expect(collected).toHaveLength(1);
		expect(collected[0].variableName).toBe('pokemonstatBaseStat1');
		expect(collected[0].nodeIds).toEqual([rule.nodeId]);
	});

	it('deduplicates structurally identical subqueries onto one variable', () => {
		const first = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const second = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_lt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const collected = collectSubqueries(createFilterGroup({ children: [first, second] }));

		expect(collected).toHaveLength(1);
		expect(collected[0].nodeIds).toEqual([first.nodeId, second.nodeId]);
	});

	it('deduplicates independent subqueries built with identical field values', () => {
		const firstSubquery: ScalarSubquery = {
			resourceName: 'pokemonstat',
			filter: createFilterGroup({
				children: [
					createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
					createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
				],
			}),
			selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
		};

		const secondSubquery: ScalarSubquery = {
			resourceName: 'pokemonstat',
			filter: createFilterGroup({
				children: [
					createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
					createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
				],
			}),
			selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
		};

		const first = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: firstSubquery } });
		const second = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_lt', operand: { source: 'subquery', subquery: secondSubquery } });
		const collected = collectSubqueries(createFilterGroup({ children: [first, second] }));

		expect(collected).toHaveLength(1);
		expect(collected[0].nodeIds).toEqual([first.nodeId, second.nodeId]);
	});

	it('descends into nested groups', () => {
		const rule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const collected = collectSubqueries(createFilterGroup({ children: [createFilterGroup({ children: [rule] })] }));

		expect(collected).toHaveLength(1);
	});

	it('returns nothing for a tree of literal operands', () => {
		const group = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } })],
		});

		expect(collectSubqueries(group)).toEqual([]);
	});
});
