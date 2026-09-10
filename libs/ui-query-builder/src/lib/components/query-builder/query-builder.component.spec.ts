import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { parse, print } from 'graphql';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject, IntrospectionOutputObject } from '../../core/metadata/introspection-types';
import type { ResourceDescriptor } from '../../core/metadata/read-resources';
import { createFilterGroup, createFilterRule, isFilterGroup, type FilterGroup } from '../../core/model/query-tree';
import { QUERY_BUILDER_METADATA, type FilterShortcut, type QueryBuilderMetadata } from '../../metadata/query-builder-metadata';

import { QueryBuilderStore } from '../../session/query-builder.store';
import { QueryBuilderComponent, type CompiledQuery } from './query-builder.component';

const catalog = createQueryBuilderCatalog(
	async (typeName) => (fixture as unknown as Record<string, IntrospectionInputObject>)[typeName] ?? null,
	hasuraDialect,
	async (typeName) => (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null,
);
const resources: readonly ResourceDescriptor[] = [{ resourceName: 'pokemon', booleanExpressionTypeName: 'pokemon_bool_exp' }];
const metadata: QueryBuilderMetadata = {
	resources: [{ resourceName: 'pokemon', displayName: 'Pokemon', group: 'Core', priority: 0, shortcuts: [], defaultSelectionFieldNames: ['id', 'name'] }],
	resourceLabels: {},
	fieldLabels: {},
};

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

async function openResourceSelect(spectatorInstance: Spectator<QueryBuilderComponent>): Promise<void> {
	spectatorInstance.click('[data-testid="resource-select"] [data-testid="search-select-trigger"]');
	await spectatorInstance.fixture.whenStable();
	spectatorInstance.detectChanges();
}

function clickResourceOptionByLabel(spectatorInstance: Spectator<QueryBuilderComponent>, label: string): void {
	const option = spectatorInstance
		.queryAll('[data-testid="search-select-option"]')
		.find((element) => element.textContent?.trim() === label);
	if (!option) throw new Error(`expected an option labelled "${label}"`);
	spectatorInstance.click(option as HTMLElement);
}

describe('QueryBuilderComponent', () => {
	let spectator: Spectator<QueryBuilderComponent>;
	const createComponent = createComponentFactory({
		component: QueryBuilderComponent,
		providers: [{ provide: QUERY_BUILDER_METADATA, useValue: metadata }],
	});

	it('resets the filter to an empty root group when a resource is chosen', async () => {
		spectator = createComponent({ props: { resources, catalog } });
		const store = spectator.inject(QueryBuilderStore, true);
		store.addRule(store.filter().nodeId);
		expect(store.filter().children).toHaveLength(1);

		await openResourceSelect(spectator);
		clickResourceOptionByLabel(spectator, 'Pokemon');

		expect(store.filter().children).toEqual([]);
		expect(store.resourceName()).toBe('pokemon');
	});

	it('emits the compiled query only when the compile result is complete', async () => {
		spectator = createComponent({ props: { resources, catalog } });
		const emitted: CompiledQuery[] = [];
		spectator.component.compiled.subscribe((value) => emitted.push(value));
		spectator.detectChanges();
		expect(emitted).toHaveLength(0);

		await openResourceSelect(spectator);
		clickResourceOptionByLabel(spectator, 'Pokemon');
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

describe('QueryBuilderComponent resource picker', () => {
	let spectator: Spectator<QueryBuilderComponent>;
	const createComponent = createComponentFactory({ component: QueryBuilderComponent });

	const pickerResources: readonly ResourceDescriptor[] = [
		{ resourceName: 'move', booleanExpressionTypeName: 'move_bool_exp' },
		{ resourceName: 'berryflavor', booleanExpressionTypeName: 'berryflavor_bool_exp' },
		{ resourceName: 'pokemon', booleanExpressionTypeName: 'pokemon_bool_exp' },
	];

	const pickerMetadata: QueryBuilderMetadata = {
		resources: [
			{ resourceName: 'pokemon', displayName: 'Pokémon', group: 'Core', priority: 100, shortcuts: [] },
			{ resourceName: 'move', displayName: 'Move', group: 'Core', priority: 90, shortcuts: [] },
		],
		resourceLabels: { berryflavor: 'Berry Flavor' },
		fieldLabels: {},
	};

	it('groups resources and sorts curated ones above the tail', async () => {
		spectator = createComponent({
			props: { resources: pickerResources, catalog },
			providers: [{ provide: QUERY_BUILDER_METADATA, useValue: pickerMetadata }],
		});

		await openResourceSelect(spectator);

		const groups = spectator.queryAll('[data-testid="search-select-group"]').map((group) => group.textContent?.trim());
		expect(groups[0]).toBe('Core');
		expect(groups.at(-1)).toBe('Everything else');
	});

	it('labels resources from the metadata, never raw', async () => {
		spectator = createComponent({
			props: { resources: pickerResources, catalog },
			providers: [{ provide: QUERY_BUILDER_METADATA, useValue: pickerMetadata }],
		});

		await openResourceSelect(spectator);

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Pokémon');
		expect(labels).not.toContain('pokemon');
	});

	it('labels the uncurated tail resource from the resource label table, never the raw identifier', async () => {
		spectator = createComponent({
			props: { resources: pickerResources, catalog },
			providers: [{ provide: QUERY_BUILDER_METADATA, useValue: pickerMetadata }],
		});

		await openResourceSelect(spectator);

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Berry Flavor');
		expect(labels).not.toContain('berryflavor');
	});

	it('sorts resources within the same group by descending priority, not by input order', async () => {
		spectator = createComponent({
			props: { resources: pickerResources, catalog },
			providers: [{ provide: QUERY_BUILDER_METADATA, useValue: pickerMetadata }],
		});

		await openResourceSelect(spectator);

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toEqual(['Pokémon', 'Move', 'Berry Flavor']);
	});

	it('breaks a priority tie within the same group by label', async () => {
		const tieResources: readonly ResourceDescriptor[] = [
			{ resourceName: 'zebra', booleanExpressionTypeName: 'zebra_bool_exp' },
			{ resourceName: 'apple', booleanExpressionTypeName: 'apple_bool_exp' },
		];
		const tieMetadata: QueryBuilderMetadata = {
			resources: [
				{ resourceName: 'zebra', displayName: 'Zebra', group: 'Core', priority: 50, shortcuts: [] },
				{ resourceName: 'apple', displayName: 'Apple', group: 'Core', priority: 50, shortcuts: [] },
			],
			resourceLabels: {},
			fieldLabels: {},
		};
		spectator = createComponent({
			props: { resources: tieResources, catalog },
			providers: [{ provide: QUERY_BUILDER_METADATA, useValue: tieMetadata }],
		});

		await openResourceSelect(spectator);

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toEqual(['Apple', 'Zebra']);
	});

	it('choosing a resource from the search select selects it on the store', async () => {
		spectator = createComponent({
			props: { resources: pickerResources, catalog },
			providers: [{ provide: QUERY_BUILDER_METADATA, useValue: pickerMetadata }],
		});
		const store = spectator.inject(QueryBuilderStore, true);

		await openResourceSelect(spectator);
		clickResourceOptionByLabel(spectator, 'Berry Flavor');

		expect(store.resourceName()).toBe('berryflavor');
	});
});

describe('QueryBuilderComponent choosing a curated shortcut', () => {
	let spectator: Spectator<QueryBuilderComponent>;

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

	const shortcutMetadata: QueryBuilderMetadata = {
		resources: [{ resourceName: 'pokemon', displayName: 'Pokemon', group: 'Core', priority: 0, shortcuts: [baseSpeedShortcut] }],
		resourceLabels: {},
		fieldLabels: {},
	};

	const createComponent = createComponentFactory({
		component: QueryBuilderComponent,
		providers: [{ provide: QUERY_BUILDER_METADATA, useValue: shortcutMetadata }],
	});

	it('replaces the chosen rule with a relation-scoped group in the tree, preserving sibling order', async () => {
		spectator = createComponent({ props: { resources, catalog } });
		const store = spectator.inject(QueryBuilderStore, true);
		store.selectResource('pokemon');

		const rootNodeId = store.filter().nodeId;
		const firstRuleId = addRuleAndReturnId(store, rootNodeId);
		const targetRuleId = addRuleAndReturnId(store, rootNodeId);
		const thirdRuleId = addRuleAndReturnId(store, rootNodeId);
		spectator.detectChanges();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const ruleElements = spectator.queryAll<HTMLElement>('pokedex-filter-rule');
		const targetRuleElement = ruleElements[1];
		const targetTrigger = targetRuleElement.querySelector<HTMLElement>('[data-testid="field-select"] [data-testid="search-select-trigger"]');
		if (!targetTrigger) throw new Error('expected the target rule to render a field-select trigger');
		spectator.click(targetTrigger);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const baseSpeedOption = spectator
			.queryAll('[data-testid="search-select-option"]')
			.find((option) => option.textContent?.trim() === 'Base Speed');
		if (!baseSpeedOption) throw new Error('expected a Base Speed option');
		spectator.click(baseSpeedOption as HTMLElement);
		spectator.detectChanges();

		const children = store.filter().children;
		expect(children).toHaveLength(3);
		expect(children[0].nodeId).toBe(firstRuleId);
		expect(children[2].nodeId).toBe(thirdRuleId);
		expect(children[1].nodeId).not.toBe(targetRuleId);
		expect(isFilterGroup(children[1])).toBe(true);
		if (!isFilterGroup(children[1])) return;
		expect(children[1].relationScope).toEqual({ fieldPath: ['pokemonstats'], quantifier: 'some' });
		expect(children[1].children).toHaveLength(2);
	});
});
