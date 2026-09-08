import { parse, print } from 'graphql';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule, type ScalarSubquery } from '../model/query-tree';
import { compileQuery } from './compile-query';

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

function buildHeadlineRequest() {
	const speedRule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });

	return {
		resourceName: 'pokemon',
		filter: createFilterGroup({
			children: [
				createFilterRule({ fieldPath: ['pokemontypes', 'type', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } }),
				createFilterRule({
					fieldPath: ['pokemonabilities', 'ability', 'name'],
					operatorName: '_eq',
					operand: { source: 'literal', value: 'overgrow' },
				}),
				createFilterRule({ fieldPath: ['pokemonmoves', 'move', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'razor-leaf' } }),
				createFilterGroup({
					relationScope: { fieldPath: ['pokemonstats'], quantifier: 'some' as const },
					children: [
						createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
						speedRule,
					],
				}),
			],
		}),
		selection: { fieldName: '', children: [{ fieldName: 'id', children: [] }, { fieldName: 'name', children: [] }] },
		ordering: [{ fieldPath: ['id'], direction: 'asc' as const }],
		limit: 20,
		resolvedValues: new Map<string, number>([['pokemonstatBaseStat1', 30]]),
		variableTypeNames: new Map<string, string>([['pokemonstatBaseStat1', 'Int']]),
	};
}

describe('compileQuery', () => {
	it('compiles the validated headline query', () => {
		const result = compileQuery(buildHeadlineRequest(), hasuraDialect);

		expect(result.status).toBe('complete');
		if (result.status !== 'complete') return;

		const expectedDocument = print(
			parse(`query BuiltQuery($pokemonstatBaseStat1: Int!) {
				pokemon(
					where: {_and: [
						{pokemontypes: {type: {name: {_eq: "grass"}}}}
						{pokemonabilities: {ability: {name: {_eq: "overgrow"}}}}
						{pokemonmoves: {move: {name: {_eq: "razor-leaf"}}}}
						{pokemonstats: {_and: [{stat: {name: {_eq: "speed"}}}, {base_stat: {_gt: $pokemonstatBaseStat1}}]}}
					]}
					order_by: {id: asc}
					limit: 20
				) {
					id
					name
				}
			}`),
		);

		expect(result.document).toBe(expectedDocument);
		expect(result.variables).toEqual({ pokemonstatBaseStat1: 30 });
	});

	it('coerces a float average into the integer column it is compared against', () => {
		const request = {
			...buildHeadlineRequest(),
			resolvedValues: new Map<string, number>([['pokemonstatBaseStat1', 72.4]]),
		};
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('complete');
		if (result.status !== 'complete') return;
		expect(result.variables).toEqual({ pokemonstatBaseStat1: 72 });
		expect(result.document.replace(/\s+/g, ' ')).toContain('query BuiltQuery($pokemonstatBaseStat1: Int!)');
	});

	it('reports incomplete when a subquery has no resolved value', () => {
		const request = { ...buildHeadlineRequest(), resolvedValues: new Map<string, number>() };
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.reason === 'unresolvedSubquery')).toBe(true);
	});

	it('reports incomplete, naming the nodeId, when a subquery resolves to null rather than a row', () => {
		const speedRule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const request = {
			resourceName: 'pokemon',
			filter: createFilterGroup({ children: [speedRule] }),
			selection: { fieldName: '', children: [{ fieldName: 'id', children: [] }] },
			ordering: [],
			limit: 20,
			resolvedValues: new Map<string, number | null>([['pokemonstatBaseStat1', null]]),
			variableTypeNames: new Map<string, string>([['pokemonstatBaseStat1', 'Int']]),
		};
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues).toContainEqual(
			expect.objectContaining({ nodeId: speedRule.nodeId, reason: 'unresolvedSubquery' }),
		);
	});

	it('reports incomplete for a rule with no operator, naming the offending node', () => {
		const brokenRule = createFilterRule({ fieldPath: ['name'], operatorName: '', operand: { source: 'literal', value: 'x' } });
		const request = {
			...buildHeadlineRequest(),
			filter: createFilterGroup({ children: [brokenRule] }),
			resolvedValues: new Map<string, number>(),
		};
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.nodeId === brokenRule.nodeId && issue.reason === 'incompleteRule')).toBe(true);
	});

	it('reports incomplete, naming the nodeId, when a rule has a valid field and operator but a null literal operand', () => {
		const nullLiteralRule = createFilterRule({ fieldPath: ['height'], operatorName: '_gt', operand: { source: 'literal', value: null } });
		const request = {
			...buildHeadlineRequest(),
			filter: createFilterGroup({ children: [nullLiteralRule] }),
			resolvedValues: new Map<string, number>(),
		};
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.nodeId === nullLiteralRule.nodeId && issue.reason === 'incompleteRule')).toBe(true);
	});

	it('reports incomplete when nothing is selected', () => {
		const request = { ...buildHeadlineRequest(), selection: { fieldName: '', children: [] } };
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.reason === 'emptySelection')).toBe(true);
	});
});
