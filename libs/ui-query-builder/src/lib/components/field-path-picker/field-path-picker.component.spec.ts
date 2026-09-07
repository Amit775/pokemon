import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject } from '../../core/metadata/introspection-types';
import { FieldPathPickerComponent } from './field-path-picker.component';

const catalog = createQueryBuilderCatalog(
	async (typeName) => (fixture as Record<string, IntrospectionInputObject>)[typeName] ?? null,
	hasuraDialect,
);

function expectFound<T>(value: T | undefined): T {
	if (value === undefined) throw new Error('expected value to be found');
	return value;
}

describe('FieldPathPickerComponent', () => {
	let spectator: Spectator<FieldPathPickerComponent>;
	const createComponent = createComponentFactory({ component: FieldPathPickerComponent });

	function openPanel(): void {
		spectator.click('[data-testid="field-path-trigger"]');
		spectator.detectChanges();
	}

	it('lists scalar and relation fields for the current level once opened', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="field-option"]').map((option) => option.textContent?.trim());
		expect(options).toContain('height');
		expect(options).toContain('name');
		expect(options.length).toBeGreaterThan(0);
	});

	it('drills one level deeper into a relation and lets a breadcrumb step back', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const relationOption = expectFound(
			spectator.queryAll<HTMLElement>('[data-testid="field-option"]').find((option) => option.getAttribute('data-field-kind') === 'relation'),
		);
		const relationFieldName = relationOption.textContent?.trim();

		spectator.click(relationOption);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.queryAll('[data-testid="breadcrumb-step"]').map((step) => step.textContent?.trim())).toContain(relationFieldName);

		const breadcrumbSteps = spectator.queryAll<HTMLElement>('[data-testid="breadcrumb-step"]');
		spectator.click(breadcrumbSteps[0]);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.queryAll('[data-testid="breadcrumb-step"]')).toHaveLength(1);
	});

	it('emits pathChosen with the full path when a scalar is chosen', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		let chosenPath: readonly string[] | undefined;
		spectator.output('pathChosen').subscribe((path) => (chosenPath = path));

		const scalarOption = expectFound(
			spectator.queryAll<HTMLElement>('[data-testid="field-option"]').find((option) => option.getAttribute('data-field-kind') === 'scalar'),
		);
		spectator.click(scalarOption);

		expect(chosenPath).toEqual([scalarOption.textContent?.trim()]);
	});
});
