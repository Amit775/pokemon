/**
 * @jest-environment node
 */
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule, type ScalarSubquery } from '../model/query-tree';
import { buildResolutionDocument } from './build-resolution-document';
import { collectSubqueries } from './collect-subqueries';
import { compileQuery } from './compile-query';

const endpoint = process.env['QUERY_BUILDER_ENDPOINT'];
const describeEndpoint = endpoint ? describe : describe.skip;

async function postToEndpoint(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
	const response = await fetch(endpoint as string, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	});
	const payload = await response.json();
	if (payload.errors) throw new Error(JSON.stringify(payload.errors, null, 2));
	return payload.data;
}

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
	};
}

const expectedNames = [
	'bulbasaur',
	'ivysaur',
	'venusaur',
	'chikorita',
	'bayleef',
	'meganium',
	'turtwig',
	'grotle',
	'torterra',
	'rowlet',
	'dartrix',
	'decidueye',
	'grookey',
	'thwackey',
	'rillaboom',
	'decidueye-hisui',
];

describeEndpoint('compiled query against a live endpoint', () => {
	it(
		'returns the sixteen validated matches',
		async () => {
			const headlineRequest = buildHeadlineRequest();

			const collected = collectSubqueries(headlineRequest.filter);
			const resolutionDocument = buildResolutionDocument(collected, hasuraDialect);
			console.log('resolution document:\n' + resolutionDocument);

			const resolutionData = await postToEndpoint(resolutionDocument, {});
			console.log('resolution data:\n' + JSON.stringify(resolutionData, null, 2));

			const resolvedEntry = collected[0];
			const resolutionRow = resolutionData[resolvedEntry.variableName] as { base_stat: number }[];
			const resolvedSnorlaxSpeed = resolutionRow[0].base_stat;
			console.log('resolved snorlax speed:', resolvedSnorlaxSpeed);

			expect(resolvedSnorlaxSpeed).toBe(30);

			const resolvedValues = new Map<string, number>([[resolvedEntry.variableName, resolvedSnorlaxSpeed]]);
			const variableTypeNames = new Map<string, string>([[resolvedEntry.variableName, 'Int']]);

			const result = compileQuery({ ...headlineRequest, resolvedValues, variableTypeNames }, hasuraDialect);

			expect(result.status).toBe('complete');
			if (result.status !== 'complete') return;

			console.log('built query:\n' + result.document);
			console.log('variables:\n' + JSON.stringify(result.variables, null, 2));

			const matchData = await postToEndpoint(result.document, result.variables);
			const matchedPokemon = matchData['pokemon'] as { id: number; name: string }[];
			const matchedNames = matchedPokemon.map((row) => row.name);
			console.log('matched names:\n' + JSON.stringify(matchedNames));

			expect(matchedNames).toEqual(expectedNames);
		},
		30000,
	);
});
