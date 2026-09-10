import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject, IntrospectionOutputObject } from '../../core/metadata/introspection-types';
import { QUERY_BUILDER_METADATA, type QueryBuilderMetadata } from '../../metadata/query-builder-metadata';
import { FieldPathPickerComponent } from './field-path-picker.component';

const catalog = createQueryBuilderCatalog(
	async (typeName) => (fixture as unknown as Record<string, IntrospectionInputObject>)[typeName] ?? null,
	hasuraDialect,
	async (typeName) => (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null,
);

const metadata: QueryBuilderMetadata = {
	resources: [],
	resourceLabels: {},
	fieldLabels: { pokemontypes: 'Types', height: 'Height (cm)' },
};

function expectFound<T>(value: T | undefined): T {
	if (value === undefined) throw new Error('expected value to be found');
	return value;
}

describe('FieldPathPickerComponent', () => {
	let spectator: Spectator<FieldPathPickerComponent>;
	const createComponent = createComponentFactory({
		component: FieldPathPickerComponent,
		providers: [{ provide: QUERY_BUILDER_METADATA, useValue: metadata }],
	});

	function openPanel(): void {
		spectator.click('[data-testid="field-path-trigger"]');
		spectator.detectChanges();
	}

	it('lists scalar and relation fields for the current level once opened, labelled rather than raw', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(options).toContain('Height (cm)');
		expect(options).toContain('Name');
		expect(options).not.toContain('height');
		expect(options.length).toBeGreaterThan(0);
	});

	it('drills one level deeper into a relation and lets a breadcrumb step back', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const relationOption = expectFound(
			spectator
				.queryAll<HTMLElement>('[data-testid="search-select-option"]')
				.find((option) => option.getAttribute('data-field-kind') === 'relation'),
		);
		const relationFieldLabel = relationOption.textContent?.trim();

		spectator.click(relationOption);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.queryAll('[data-testid="breadcrumb-step"]').map((step) => step.textContent?.trim())).toContain(relationFieldLabel);

		const breadcrumbSteps = spectator.queryAll<HTMLElement>('[data-testid="breadcrumb-step"]');
		spectator.click(breadcrumbSteps[0]);
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.queryAll('[data-testid="breadcrumb-step"]')).toHaveLength(1);
	});

	it('emits pathChosen with the full raw path when a scalar is chosen, even though the option is labelled', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		let chosenPath: readonly string[] | undefined;
		spectator.output('pathChosen').subscribe((path) => (chosenPath = path));

		const heightOption = expectFound(
			spectator.queryAll<HTMLElement>('[data-testid="search-select-option"]').find((option) => option.textContent?.trim() === 'Height (cm)'),
		);
		spectator.click(heightOption);

		expect(chosenPath).toEqual(['height']);
	});

	it('resumes a multi-segment path by opening at the level of its final segment', async () => {
		spectator = createComponent({
			props: { catalog, rootTypeName: 'pokemon_bool_exp', path: ['pokemontypes', 'type', 'name'] },
		});
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.queryAll('[data-testid="breadcrumb-step"]').map((step) => step.textContent?.trim())).toEqual([
			'root',
			'Types',
			'Type',
		]);

		const options = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(options).toContain('Name');
	});

	it('falls back to the root when a saved path segment no longer resolves against the catalog', async () => {
		spectator = createComponent({
			props: { catalog, rootTypeName: 'pokemon_bool_exp', path: ['no_such_relation', 'name'] },
		});
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.queryAll('[data-testid="breadcrumb-step"]').map((step) => step.textContent?.trim())).toEqual(['root']);

		const options = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(options).toContain('Height (cm)');
	});

	it('excludes aggregate-predicate fields from the rendered field list', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const aggregateOptions = spectator.queryAll('[data-testid="search-select-option"][data-field-kind="aggregatePredicate"]');
		expect(aggregateOptions).toHaveLength(0);
	});

	it('filters the field list by the searched label', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		openPanel();
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		spectator.typeInElement('height', '[data-testid="search-select-search"]');
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(options).toEqual(['Height (cm)']);
	});

	it('shows the chosen path on the trigger, labelled rather than as a raw dotted identifier', async () => {
		spectator = createComponent({
			props: { catalog, rootTypeName: 'pokemon_bool_exp', path: ['pokemontypes', 'type', 'name'] },
		});
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const triggerText = spectator.query('[data-testid="field-path-trigger"]')?.textContent?.trim();
		expect(triggerText).toBe('Types / Type / Name');
		expect(triggerText).not.toContain('pokemontypes');
		expect(triggerText).not.toBe('Choose field');
	});

	it('still reads Choose field when no path has been chosen', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp' } });
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="field-path-trigger"]')?.textContent?.trim()).toBe('Choose field');
	});

	it('uses a custom trigger test id when one is provided', async () => {
		spectator = createComponent({ props: { catalog, rootTypeName: 'pokemon_bool_exp', triggerTestId: 'field-advanced' } });
		await spectator.fixture.whenStable();

		expect(spectator.query('[data-testid="field-advanced"]')).toExist();
		expect(spectator.query('[data-testid="field-path-trigger"]')).not.toExist();
	});
});
