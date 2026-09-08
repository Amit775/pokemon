import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { createFilterGroup, createFilterRule } from '../../core/model/query-tree';
import { FilterGroupComponent } from './filter-group.component';

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

	it('emits a combinator change when the AND/OR toggle is used', () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group } });
		const emitted: string[] = [];
		spectator.component.combinatorChanged.subscribe((value: string) => emitted.push(value));

		spectator.click('[data-testid="combinator-or"]');

		expect(emitted).toEqual(['or']);
	});

	it('emits a negation change when the NOT toggle is used', () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group } });
		const emitted: boolean[] = [];
		spectator.component.negatedChanged.subscribe((value: boolean) => emitted.push(value));

		spectator.click('[data-testid="negate-toggle"]');

		expect(emitted).toEqual([true]);
	});
});
