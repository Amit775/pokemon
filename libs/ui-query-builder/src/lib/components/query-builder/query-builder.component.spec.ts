import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { parse, print } from 'graphql';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject } from '../../core/metadata/introspection-types';
import type { ResourceDescriptor } from '../../core/metadata/read-resources';
import { createFilterGroup, createFilterRule, isFilterGroup, type FilterGroup } from '../../core/model/query-tree';
import { QUERY_BUILDER_OVERLAY, type QueryBuilderOverlay } from '../../overlay/query-builder-overlay';
import { QueryBuilderStore } from '../../session/query-builder.store';
import { QueryBuilderComponent, type CompiledQuery } from './query-builder.component';

const catalog = createQueryBuilderCatalog(async (typeName) => (fixture as Record<string, IntrospectionInputObject>)[typeName] ?? null, hasuraDialect);
const resources: readonly ResourceDescriptor[] = [{ resourceName: 'pokemon', booleanExpressionTypeName: 'pokemon_bool_exp' }];
const overlay: QueryBuilderOverlay = { resources: { pokemon: { defaultSelectionFieldNames: ['id', 'name'] } }, fieldLabels: {} };

function findGroup(node: FilterGroup, nodeId: string): FilterGroup {
	if (node.nodeId === nodeId) return node;
	for (const child of node.children) {
		if (isFilterGroup(child)) {
			const found = findGroup(child, nodeId);
			if (found) return found;
		}
	}
	throw new Error(`group ${nodeId} was not found`);
}

function addRuleAndReturnId(store: InstanceType<typeof QueryBuilderStore>, groupNodeId: string): string {
	store.addRule(groupNodeId);
	const group = findGroup(store.filter(), groupNodeId);
	return group.children[group.children.length - 1].nodeId;
}

describe('QueryBuilderComponent', () => {
	let spectator: Spectator<QueryBuilderComponent>;
	const createComponent = createComponentFactory({
		component: QueryBuilderComponent,
		providers: [{ provide: QUERY_BUILDER_OVERLAY, useValue: overlay }],
	});

	it('resets the filter to an empty root group when a resource is chosen', () => {
		spectator = createComponent({ props: { resources, catalog } });
		const store = spectator.inject(QueryBuilderStore, true);
		store.addRule(store.filter().nodeId);
		expect(store.filter().children).toHaveLength(1);

		spectator.click('[data-testid="resource-option"]');

		expect(store.filter().children).toEqual([]);
		expect(store.resourceName()).toBe('pokemon');
	});

	it('emits the compiled query only when the compile result is complete', () => {
		spectator = createComponent({ props: { resources, catalog } });
		const emitted: CompiledQuery[] = [];
		spectator.component.compiled.subscribe((value) => emitted.push(value));
		spectator.detectChanges();
		expect(emitted).toHaveLength(0);

		spectator.click('[data-testid="resource-option"]');
		spectator.detectChanges();

		expect(emitted).toHaveLength(1);
	});

	it('assembles the headline query through the store and emits the document that matches the validated contract', () => {
		spectator = createComponent({ props: { resources, catalog } });
		const store = spectator.inject(QueryBuilderStore, true);
		const emitted: CompiledQuery[] = [];
		spectator.component.compiled.subscribe((value) => emitted.push(value));

		store.selectResource('pokemon');
		store.setSelection({
			fieldName: '',
			children: [
				{ fieldName: 'id', children: [] },
				{ fieldName: 'name', children: [] },
			],
		});
		store.setLimit(20);

		const rootNodeId = store.filter().nodeId;

		const typeRuleId = addRuleAndReturnId(store, rootNodeId);
		store.updateRule(typeRuleId, { fieldPath: ['pokemontypes', 'type', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } });

		const abilityRuleId = addRuleAndReturnId(store, rootNodeId);
		store.updateRule(abilityRuleId, { fieldPath: ['pokemonabilities', 'ability', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'overgrow' } });

		const moveRuleId = addRuleAndReturnId(store, rootNodeId);
		store.updateRule(moveRuleId, { fieldPath: ['pokemonmoves', 'move', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'razor-leaf' } });

		store.addGroup(rootNodeId);
		const statsGroupId = store.filter().children[store.filter().children.length - 1].nodeId;
		store.setRelationScope(statsGroupId, { fieldPath: ['pokemonstats'], quantifier: 'some' });

		const statNameRuleId = addRuleAndReturnId(store, statsGroupId);
		store.updateRule(statNameRuleId, { fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } });

		const baseStatRuleId = addRuleAndReturnId(store, statsGroupId);
		store.updateRule(baseStatRuleId, {
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

		store.setResolvedValue('pokemonstatBaseStat1', 30, 'Int');
		spectator.detectChanges();

		expect(emitted).toHaveLength(1);
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

		expect(emitted[0].document).toBe(expectedDocument);
		expect(emitted[0].variables).toEqual({ pokemonstatBaseStat1: 30 });
	});

	it('records the real comparison type of the compared column against the owning rule, not a guess derived from the resolved value', async () => {
		spectator = createComponent({ props: { resources, catalog } });
		const store = spectator.inject(QueryBuilderStore, true);

		store.selectResource('pokemon');
		store.addGroup(store.filter().nodeId);
		const statsGroupId = store.filter().children[store.filter().children.length - 1].nodeId;
		store.setRelationScope(statsGroupId, { fieldPath: ['pokemonstats'], quantifier: 'some' });

		const baseStatRuleId = addRuleAndReturnId(store, statsGroupId);
		store.updateRule(baseStatRuleId, {
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: {
					resourceName: 'pokemonstat',
					filter: createFilterGroup(),
					selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['base_stat'] },
				},
			},
		});
		spectator.detectChanges();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(store.comparisonTypeNames().get(baseStatRuleId)).toBe('Int_comparison_exp');
	});

	it('types a number through the operand editor DOM and emits an unquoted integer literal, not a quoted string', async () => {
		spectator = createComponent({ props: { resources, catalog } });
		const store = spectator.inject(QueryBuilderStore, true);

		store.selectResource('pokemon');
		store.setSelection({ fieldName: '', children: [{ fieldName: 'id', children: [] }] });

		const ruleId = addRuleAndReturnId(store, store.filter().nodeId);
		store.updateRule(ruleId, { fieldPath: ['height'], operatorName: '_gt' });

		spectator.detectChanges();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input to be rendered');
		spectator.typeInElement('10', literalInput);
		spectator.detectChanges();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const rule = store.filter().children[0];
		expect(rule).toMatchObject({ operand: { source: 'literal', value: 10 } });

		const result = store.compileResult();
		expect(result.status).toBe('complete');
		if (result.status !== 'complete') return;

		const expectedDocument = print(
			parse(`query BuiltQuery {
				pokemon(where: {_and: [{height: {_gt: 10}}]}, order_by: {id: asc}, limit: 50) {
					id
				}
			}`),
		);
		expect(result.document).toBe(expectedDocument);
	});
});
