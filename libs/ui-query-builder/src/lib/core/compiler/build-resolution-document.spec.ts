import { parse, print } from 'graphql';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule } from '../model/query-tree';
import { buildResolutionDocument } from './build-resolution-document';
import { collectSubqueries } from './collect-subqueries';

describe('buildResolutionDocument', () => {
	it('produces one alias per subquery, ordered and limited to a single row', () => {
		const rule = createFilterRule({
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: {
					resourceName: 'pokemonstat',
					filter: createFilterGroup({
						children: [
							createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
							createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
						],
					}),
					selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
				},
			},
		});

		const document = buildResolutionDocument(collectSubqueries(createFilterGroup({ children: [rule] })), hasuraDialect);

		const expectedDocument = print(
			parse(`query ResolveOperands {
				pokemonstatBaseStat1: pokemonstat(
					where: {_and: [{pokemon: {name: {_eq: "snorlax"}}}, {stat: {name: {_eq: "speed"}}}]}
					order_by: {id: asc}
					limit: 1
				) {
					base_stat
				}
			}`),
		);

		expect(document).toBe(expectedDocument);
	});

	it('produces an aggregate selection for an aggregate selector', () => {
		const rule = createFilterRule({
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: {
					resourceName: 'pokemonstat',
					filter: null,
					selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['base_stat'] },
				},
			},
		});

		const document = buildResolutionDocument(collectSubqueries(createFilterGroup({ children: [rule] })), hasuraDialect);

		const expectedDocument = print(
			parse(`query ResolveOperands {
				pokemonstatAvgBaseStat1: pokemonstat_aggregate {
					aggregate {
						avg {
							base_stat
						}
					}
				}
			}`),
		);

		expect(document).toBe(expectedDocument);
	});

	it('returns an empty string when there is nothing to resolve', () => {
		expect(buildResolutionDocument([], hasuraDialect)).toBe('');
	});
});
