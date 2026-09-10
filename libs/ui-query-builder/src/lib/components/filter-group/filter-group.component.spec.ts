import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { CatalogFieldDescriptor } from '../../core/metadata/introspection-types';
import { createFilterGroup, createFilterRule } from '../../core/model/query-tree';
import { QUERY_BUILDER_METADATA, type QueryBuilderMetadata } from '../../metadata/query-builder-metadata';
import { FilterGroupComponent, type FilterGroupPatch } from './filter-group.component';

const relationScopeCatalog: QueryBuilderCatalog = {
	readBooleanExpressionFields: async (typeName) =>
		typeName === 'pokemon_bool_exp'
			? ([
					{ kind: 'relation', fieldName: 'pokemonstats', booleanExpressionTypeName: 'pokemonstat_bool_exp', cardinality: 'toMany' },
					{ kind: 'relation', fieldName: 'pokemonspecy', booleanExpressionTypeName: 'pokemonspecies_bool_exp', cardinality: 'toOne' },
					{ kind: 'scalar', fieldName: 'name', comparisonTypeName: 'String_comparison_exp' },
				] satisfies readonly CatalogFieldDescriptor[])
			: [],
	readOperatorsForComparisonType: async () => [],
	readOutputObjectFields: async () => [],
};

const relationScopeMetadata: QueryBuilderMetadata = {
	resources: [],
	resourceLabels: {},
	fieldLabels: { pokemonstats: 'Stats' },
};

describe('FilterGroupComponent', () => {
	let spectator: Spectator<FilterGroupComponent>;
	const createComponent = createComponentFactory({ component: FilterGroupComponent });

	it('renders one rule editor per rule child', () => {
		const group = createFilterGroup({
			children: [
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'a' } }),
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'b' } }),
			],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.queryAll('pokedex-filter-rule')).toHaveLength(2);
	});

	it('renders itself recursively for nested groups', () => {
		const group = createFilterGroup({
			children: [
				createFilterGroup({
					children: [createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'deep' } })],
				}),
			],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.queryAll('pokedex-filter-group').length).toBeGreaterThanOrEqual(1);
		expect(spectator.queryAll('pokedex-filter-rule')).toHaveLength(1);
	});

	it('patches the combinator, naming the group, when the AND/OR toggle is used', () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group } });
		const emitted: FilterGroupPatch[] = [];
		spectator.component.groupPatched.subscribe((patch: FilterGroupPatch) => emitted.push(patch));

		spectator.click('[data-testid="combinator-or"]');

		expect(emitted).toEqual([{ nodeId: group.nodeId, combinator: 'or' }]);
	});

	it('patches the negation, naming the group, when the NOT toggle is used', () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group } });
		const emitted: FilterGroupPatch[] = [];
		spectator.component.groupPatched.subscribe((patch: FilterGroupPatch) => emitted.push(patch));

		spectator.click('[data-testid="negate-toggle"]');

		expect(emitted).toEqual([{ nodeId: group.nodeId, negated: true }]);
	});

	it('renders a pinned child rule as fixed context, not an editable rule', () => {
		const group = createFilterGroup({
			children: [
				createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' }, pinned: true }),
			],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.query('[data-testid="pinned-condition"]')).toExist();
		expect(spectator.query('[data-testid="operator-option"]')).not.toExist();
	});

	it('renders a non-pinned child rule as an editable rule, not fixed context', () => {
		const group = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } })],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.query('[data-testid="pinned-condition"]')).not.toExist();
	});

	it('offers no remove control for a pinned child rule', () => {
		const group = createFilterGroup({
			children: [
				createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' }, pinned: true }),
			],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.query('[data-testid="pinned-condition"]')).toExist();
		expect(spectator.query('[data-testid="remove-node"]')).not.toExist();
	});

	it('offers a remove control for a non-pinned child rule', () => {
		const group = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } })],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.query('[data-testid="remove-node"]')).toExist();
	});

});

describe('FilterGroupComponent relation scope picker', () => {
	let spectator: Spectator<FilterGroupComponent>;
	const createComponent = createComponentFactory({
		component: FilterGroupComponent,
		providers: [{ provide: QUERY_BUILDER_METADATA, useValue: relationScopeMetadata }],
	});

	it('reads the root boolean expression fields only once the relation scope picker is opened', async () => {
		const readBooleanExpressionFields = jest.fn(async () => [] as readonly CatalogFieldDescriptor[]);
		const countingCatalog: QueryBuilderCatalog = {
			readBooleanExpressionFields,
			readOperatorsForComparisonType: async () => [],
			readOutputObjectFields: async () => [],
		};
		const group = createFilterGroup();
		spectator = createComponent({ props: { group, catalog: countingCatalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();

		expect(readBooleanExpressionFields).not.toHaveBeenCalled();

		spectator.click('[data-testid="relation-scope-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(readBooleanExpressionFields).toHaveBeenCalledTimes(1);
	});

	it('shows the loading state, not the empty state, while the deferred relation scope read is in flight', async () => {
		let resolveFields: ((fields: readonly CatalogFieldDescriptor[]) => void) | undefined;
		const deferredCatalog: QueryBuilderCatalog = {
			readBooleanExpressionFields: () =>
				new Promise<readonly CatalogFieldDescriptor[]>((resolve) => {
					resolveFields = resolve;
				}),
			readOperatorsForComparisonType: async () => [],
			readOutputObjectFields: async () => [],
		};
		const group = createFilterGroup();
		spectator = createComponent({ props: { group, catalog: deferredCatalog, rootTypeName: 'pokemon_bool_exp' } });

		spectator.click('[data-testid="relation-scope-select"] [data-testid="search-select-trigger"]');
		spectator.detectChanges();

		expect(spectator.query('[data-testid="search-select-loading"]')).toExist();
		expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();

		if (!resolveFields) throw new Error('expected the relation scope read to have started');
		resolveFields([
			{ kind: 'relation', fieldName: 'pokemonstats', booleanExpressionTypeName: 'pokemonstat_bool_exp', cardinality: 'toMany' },
		]);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="search-select-loading"]')).not.toExist();
		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Stats');
	});

	it('picks the relation scope path instead of typing it', async () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group, catalog: relationScopeCatalog, rootTypeName: 'pokemon_bool_exp' } });

		spectator.click('[data-testid="relation-scope-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Stats');
		expect(labels).not.toContain('pokemonstats');
		expect(spectator.query('[data-testid="relation-scope-input"]')).not.toExist();
	});

	it('offers a way back to no relation scope, so a mis-click does not scope the group permanently', async () => {
		const group = createFilterGroup({ relationScope: { fieldPath: ['pokemonstats'], quantifier: 'some' } });
		spectator = createComponent({ props: { group, catalog: relationScopeCatalog, rootTypeName: 'pokemon_bool_exp' } });
		const emitted: FilterGroupPatch[] = [];
		spectator.component.groupPatched.subscribe((patch: FilterGroupPatch) => emitted.push(patch));

		spectator.click('[data-testid="relation-scope-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const clearOption = spectator
			.queryAll<HTMLElement>('[data-testid="search-select-option"]')
			.find((option) => option.textContent?.trim() === 'No relation scope');
		if (!clearOption) throw new Error('expected an option that clears the relation scope');

		spectator.click(clearOption);

		expect(emitted).toEqual([{ nodeId: group.nodeId, relationScope: null }]);
	});
});
