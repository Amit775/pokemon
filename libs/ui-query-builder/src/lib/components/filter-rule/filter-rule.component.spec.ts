import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject, IntrospectionOutputObject } from '../../core/metadata/introspection-types';
import { createFilterRule, isFilterGroup, isFilterRule, type FilterRule, type QueryBuilderNode } from '../../core/model/query-tree';
import { QUERY_BUILDER_METADATA, type FilterShortcut, type QueryBuilderMetadata } from '../../metadata/query-builder-metadata';
import { FilterRuleComponent } from './filter-rule.component';

const typedFixture = fixture as unknown as Record<string, IntrospectionInputObject>;
const typedOutputFixture = fixture as unknown as Record<string, IntrospectionOutputObject>;

const fixtureFetcher = async (typeName: string) => typedFixture[typeName] ?? null;
const outputFetcher = async (typeName: string) => typedOutputFixture[typeName] ?? null;

const catalog = createQueryBuilderCatalog(fixtureFetcher, hasuraDialect, outputFetcher);

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

const metadata: QueryBuilderMetadata = {
	resources: [{ resourceName: 'pokemon', displayName: 'Pokémon', group: 'Core', priority: 100, shortcuts: [typeShortcut, baseSpeedShortcut] }],
	resourceLabels: {},
	fieldLabels: { pokemonstats: 'Stats' },
};

const baseSpeedGroupChild: FilterRule = createFilterRule({
	fieldPath: ['stat', 'name'],
	operatorName: '_eq',
	operand: { source: 'literal', value: 'speed' },
});

const baseProps = {
	catalog,
	rule: createFilterRule({ fieldPath: [], operatorName: '' }),
	comparisonTypeName: '',
	rootTypeName: 'pokemon_bool_exp',
};

describe('FilterRuleComponent shortcut-first field picker', () => {
	let spectator: Spectator<FilterRuleComponent>;
	const createComponent = createComponentFactory({
		component: FilterRuleComponent,
		providers: [{ provide: QUERY_BUILDER_METADATA, useValue: metadata }],
	});

	beforeEach(() => {
		spectator = createComponent({ props: baseProps });
	});

	it('offers the curated shortcuts for the current resource, by display name', async () => {
		spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Type');
		expect(labels).toContain('Base Speed');
		expect(labels).not.toContain('pokemontypes');
	});

	it('choosing a scoped shortcut emits a relation-scoped group, not a bare rule', async () => {
		const emitted: QueryBuilderNode[] = [];
		spectator.component.shortcutChosen.subscribe((node: QueryBuilderNode) => emitted.push(node));

		spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const baseSpeedOption = spectator
			.queryAll('[data-testid="search-select-option"]')
			.find((option) => option.textContent?.trim() === 'Base Speed');
		spectator.click(baseSpeedOption as HTMLElement);

		expect(emitted).toHaveLength(1);
		const [node] = emitted;
		expect(isFilterGroup(node)).toBe(true);
		if (!isFilterGroup(node)) return;
		expect(node.relationScope).toEqual({ fieldPath: ['pokemonstats'], quantifier: 'some' });
		expect(node.children).toHaveLength(2);
	});

	it('choosing an unscoped shortcut emits a bare rule, not a group', async () => {
		const emitted: QueryBuilderNode[] = [];
		spectator.component.shortcutChosen.subscribe((node: QueryBuilderNode) => emitted.push(node));

		spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const typeOption = spectator.queryAll('[data-testid="search-select-option"]').find((option) => option.textContent?.trim() === 'Type');
		spectator.click(typeOption as HTMLElement);

		expect(emitted).toHaveLength(1);
		const [node] = emitted;
		expect(isFilterRule(node)).toBe(true);
		if (!isFilterRule(node)) return;
		expect(node.fieldPath).toEqual(['pokemontypes', 'type', 'name']);
	});

	it('renders a pinned condition as fixed context, not as an editable rule', async () => {
		spectator = createComponent({ props: { ...baseProps, rule: baseSpeedGroupChild, pinned: true } });
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="pinned-condition"]')).toHaveText('Stat is Speed');
		expect(spectator.query('[data-testid="pinned-condition"] input')).not.toExist();
		expect(spectator.query('[data-testid="operator-option"]')).not.toExist();
	});

	it('hides a curated shortcut whose path no longer resolves', async () => {
		const catalogWithoutStats = createQueryBuilderCatalog(
			async (typeName) => (typeName === 'pokemonstat_bool_exp' ? null : fixtureFetcher(typeName)),
			hasuraDialect,
			outputFetcher,
		);
		spectator = createComponent({ props: { ...baseProps, catalog: catalogWithoutStats } });

		spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Type');
		expect(labels).not.toContain('Base Speed');
	});

	it('the advanced affordance reveals the labelled raw graph', async () => {
		spectator.click('[data-testid="field-advanced"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Stats');
		expect(labels).not.toContain('pokemonstats');
	});

	it('the advanced path still reaches a field no curated shortcut covers', async () => {
		spectator.click('[data-testid="field-advanced"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const heightOption = spectator
			.queryAll<HTMLElement>('[data-testid="search-select-option"]')
			.find((option) => option.textContent?.trim() === 'Height');
		if (!heightOption) throw new Error('expected a Height option in the advanced picker');

		let latestRule = spectator.component.rule();
		spectator.output('ruleChange').subscribe((rule) => (latestRule = rule));

		spectator.click(heightOption);
		spectator.detectChanges();

		expect(latestRule.fieldPath).toEqual(['height']);
	});

	it('renders a pinned hyphenated value as separate words, not as a half-humanized slug', async () => {
		const specialAttackPinnedRule: FilterRule = createFilterRule({
			fieldPath: ['stat', 'name'],
			operatorName: '_eq',
			operand: { source: 'literal', value: 'special-attack' },
		});
		spectator = createComponent({ props: { ...baseProps, rule: specialAttackPinnedRule, pinned: true } });
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="pinned-condition"]')).toHaveText('Stat is Special Attack');
	});

	it('shows a field chosen through the advanced picker on the advanced trigger, labelled', async () => {
		spectator.click('[data-testid="field-advanced"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const heightOption = spectator
			.queryAll<HTMLElement>('[data-testid="search-select-option"]')
			.find((option) => option.textContent?.trim() === 'Height');
		if (!heightOption) throw new Error('expected a Height option in the advanced picker');

		spectator.click(heightOption);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="field-advanced"]')?.textContent?.trim()).toBe('Height');
	});

	it('leaves the advanced trigger reading Advanced while the rule has no field of its own', async () => {
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="field-advanced"]')?.textContent?.trim()).toBe('Advanced');
	});

	it('renders the operators as human wording, never as the raw schema identifier', async () => {
		spectator = createComponent({
			props: { ...baseProps, rule: createFilterRule({ fieldPath: ['name'], operatorName: '_eq' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]').map((option) => option.textContent?.trim());
		expect(options).toContain('is');
		expect(options).toContain('contains');
		expect(options).toContain('is one of');
		expect(options.filter((label) => label?.startsWith('_'))).toEqual([]);
		expect(options.filter((label) => label === '')).toEqual([]);
	});

	it('offers exactly the nine integer operators for an integer field', async () => {
		spectator = createComponent({
			props: { ...baseProps, rule: createFilterRule({ fieldPath: ['height'], operatorName: '_eq' }), comparisonTypeName: 'Int_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]').map((option) => option.textContent?.trim());
		expect(options).toHaveLength(9);
		expect(options).toContain('is greater than');
		expect(options).not.toContain('_gt');
		expect(options).not.toContain('contains');
	});

	it('offers the nineteen string operators for a string field', async () => {
		spectator = createComponent({
			props: { ...baseProps, rule: createFilterRule({ fieldPath: ['name'], operatorName: '_eq' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]');
		expect(options).toHaveLength(19);
	});

	it('shows a validation message when the rule has no operator', async () => {
		spectator = createComponent({
			props: { ...baseProps, rule: createFilterRule({ fieldPath: ['name'], operatorName: '' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="rule-issue"]')).toExist();
	});

	it('emits the updated rule when a different operator is chosen', async () => {
		spectator = createComponent({
			props: { ...baseProps, rule: createFilterRule({ fieldPath: ['name'], operatorName: '_eq' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		let latestRule = spectator.component.rule();
		spectator.output('ruleChange').subscribe((rule) => (latestRule = rule));

		const likeOption = spectator
			.queryAll<HTMLElement>('[data-testid="operator-option"]')
			.find((option) => option.textContent?.trim() === 'contains, matching case');
		if (!likeOption) throw new Error('expected a _like operator option');
		spectator.click(likeOption);
		spectator.detectChanges();

		expect(latestRule.operatorName).toBe('_like');
	});

	it('passes its catalog down to the operand editor so the subquery field picker resolves output fields for the chosen resource', async () => {
		spectator = createComponent({
			props: {
				...baseProps,
				rule: createFilterRule({
					fieldPath: [],
					operatorName: '_eq',
					operand: { source: 'subquery', subquery: { resourceName: 'pokemon', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } } },
				}),
			},
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		spectator.click('[data-testid="operand-subquery-field-path"] [data-testid="search-select-trigger"]');
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toContain('Height');
		expect(labels).not.toContain('height');
	});
});
