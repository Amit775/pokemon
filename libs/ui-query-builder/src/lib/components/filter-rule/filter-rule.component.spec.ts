import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject } from '../../core/metadata/introspection-types';
import { createFilterRule } from '../../core/model/query-tree';
import { FilterRuleComponent } from './filter-rule.component';

const catalog = createQueryBuilderCatalog(
	async (typeName) => (fixture as unknown as Record<string, IntrospectionInputObject>)[typeName] ?? null,
	hasuraDialect,
);

describe('FilterRuleComponent', () => {
	let spectator: Spectator<FilterRuleComponent>;
	const createComponent = createComponentFactory({ component: FilterRuleComponent });

	it('offers exactly the nine integer operators for an integer field', async () => {
		spectator = createComponent({
			props: { catalog, rule: createFilterRule({ fieldPath: ['height'], operatorName: '_eq' }), comparisonTypeName: 'Int_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]').map((option) => option.textContent?.trim());
		expect(options).toHaveLength(9);
		expect(options).toContain('_gt');
		expect(options).not.toContain('_ilike');
	});

	it('offers the nineteen string operators for a string field', async () => {
		spectator = createComponent({
			props: { catalog, rule: createFilterRule({ fieldPath: ['name'], operatorName: '_eq' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]');
		expect(options).toHaveLength(19);
	});

	it('shows a validation message when the rule has no operator', async () => {
		spectator = createComponent({
			props: { catalog, rule: createFilterRule({ fieldPath: ['name'], operatorName: '' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="rule-issue"]')).toExist();
	});

	it('emits the updated rule when a different operator is chosen', async () => {
		spectator = createComponent({
			props: { catalog, rule: createFilterRule({ fieldPath: ['name'], operatorName: '_eq' }), comparisonTypeName: 'String_comparison_exp' },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		let latestRule = spectator.component.rule();
		spectator.output('ruleChange').subscribe((rule) => (latestRule = rule));

		const likeOption = spectator.queryAll<HTMLElement>('[data-testid="operator-option"]').find((option) => option.textContent?.trim() === '_like');
		if (!likeOption) throw new Error('expected a _like operator option');
		spectator.click(likeOption);
		spectator.detectChanges();

		expect(latestRule.operatorName).toBe('_like');
	});
});
