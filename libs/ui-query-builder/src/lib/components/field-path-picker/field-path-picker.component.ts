import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { CatalogFieldDescriptor } from '../../core/metadata/introspection-types';
import { QUERY_BUILDER_METADATA } from '../../metadata/query-builder-metadata';
import { resolveFieldLabel } from '../../metadata/resolve-labels';

interface DrillStep {
	readonly fieldName: string;
	readonly typeName: string;
}

const boolExpSuffixPattern = /_bool_exp$/;

function resourceNameFromTypeName(typeName: string): string {
	return typeName.replace(boolExpSuffixPattern, '');
}

@Component({
	selector: 'pokedex-field-path-picker',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus],
	template: `
		<div class="field-path-picker">
			<button
				type="button"
				class="trigger"
				cdkOverlayOrigin
				#origin="cdkOverlayOrigin"
				[attr.data-testid]="triggerTestId()"
				(click)="isOpen.set(!isOpen())"
			>
				{{ displayLabel() }}
			</button>

			<ng-template
				cdkConnectedOverlay
				[cdkConnectedOverlayOrigin]="origin"
				[cdkConnectedOverlayOpen]="isOpen()"
				[cdkConnectedOverlayHasBackdrop]="true"
				cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
				(backdropClick)="isOpen.set(false)"
				(detach)="isOpen.set(false)"
			>
				<div class="panel" cdkTrapFocus tabindex="-1" data-testid="field-path-panel" (keydown.escape)="isOpen.set(false)">
					<div class="breadcrumb">
						<button type="button" class="breadcrumb-step" data-testid="breadcrumb-step" (click)="stepBackTo(0)">root</button>
						@for (step of drillSteps(); track step.fieldName; let index = $index) {
							<span class="breadcrumb-separator">/</span>
							<button type="button" class="breadcrumb-step" data-testid="breadcrumb-step" (click)="stepBackTo(index + 1)">
								{{ breadcrumbLabel(step, index) }}
							</button>
						}
					</div>

					<input
						type="text"
						class="search-input"
						data-testid="search-select-search"
						placeholder="Search fields"
						autocomplete="off"
						[value]="searchText()"
						(input)="onSearchInput($event)"
					/>

					<ul class="field-list">
						@for (field of filteredFields(); track field.fieldName) {
							<li>
								<button
									type="button"
									class="field-option"
									data-testid="search-select-option"
									[attr.data-field-kind]="field.kind"
									(click)="selectField(field)"
								>
									{{ labelForField(field.fieldName) }}
								</button>
							</li>
						}
					</ul>
				</div>
			</ng-template>
		</div>
	`,
	styles: `
		:host { display: inline-block; }
		.trigger {
			font: inherit;
			font-size: var(--fs-sm);
			padding: var(--s-1) var(--s-3);
			border-radius: var(--r-md);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink);
			cursor: pointer;
		}
		.panel {
			min-width: 14rem;
			max-height: 18rem;
			overflow-y: auto;
			padding: var(--s-2);
			border-radius: var(--r-md);
			border: 1px solid var(--line);
			background: var(--surface-raised);
			box-shadow: var(--shadow-lg);
		}
		.breadcrumb {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--s-1);
			margin-bottom: var(--s-2);
			font-size: var(--fs-xs);
			color: var(--ink-muted);
		}
		.breadcrumb-step {
			font: inherit;
			border: none;
			background: none;
			color: var(--accent);
			cursor: pointer;
			padding: 0;
		}
		.search-input {
			font: inherit;
			font-size: var(--fs-sm);
			width: 100%;
			box-sizing: border-box;
			padding: var(--s-1) var(--s-2);
			margin-bottom: var(--s-2);
			border-radius: var(--r-sm);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink);
		}
		.field-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
		.field-option {
			font: inherit;
			font-size: var(--fs-sm);
			text-align: left;
			padding: var(--s-1) var(--s-2);
			border: none;
			border-radius: var(--r-sm);
			background: none;
			color: var(--ink);
			cursor: pointer;
		}
		.field-option:hover { background: var(--surface-sunken); }
		.trigger:focus-visible, .breadcrumb-step:focus-visible, .field-option:focus-visible, .search-input:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	`,
})
export class FieldPathPickerComponent {
	readonly catalog = input.required<QueryBuilderCatalog>();
	readonly rootTypeName = input.required<string>();
	readonly path = input<readonly string[]>([]);
	readonly triggerTestId = input<string>('field-path-trigger');
	readonly triggerLabel = input<string | null>(null);
	readonly pathChosen = output<readonly string[]>();

	private readonly metadata = inject(QUERY_BUILDER_METADATA);

	protected readonly isOpen = signal(false);
	protected readonly drillSteps = signal<readonly DrillStep[]>([]);
	protected readonly searchText = signal('');

	protected readonly currentTypeName = computed(() => {
		const steps = this.drillSteps();
		return steps.length > 0 ? steps[steps.length - 1].typeName : this.rootTypeName();
	});

	protected readonly currentResourceName = computed(() => resourceNameFromTypeName(this.currentTypeName()));

	private readonly drillStepsResource = resource({
		params: () => ({ rootTypeName: this.rootTypeName(), path: this.path() }),
		loader: ({ params }) => this.resolveDrillSteps(params.rootTypeName, params.path),
		defaultValue: [] as readonly DrillStep[],
	});

	private readonly synchronizeDrillSteps = effect(() => {
		this.drillSteps.set(this.drillStepsResource.value());
	});

	protected readonly chosenPathLabel = computed(() => {
		const chosenPath = this.path();
		if (chosenPath.length === 0) return '';

		const resolvedSteps = this.drillStepsResource.value();
		return chosenPath
			.map((segment, index) => {
				const owningTypeName = index === 0 ? this.rootTypeName() : (resolvedSteps[index - 1]?.typeName ?? this.rootTypeName());
				return resolveFieldLabel(this.metadata, resourceNameFromTypeName(owningTypeName), segment);
			})
			.join(' / ');
	});

	protected readonly displayLabel = computed(() => {
		const override = this.triggerLabel();
		if (override !== null) return override;
		return this.chosenPathLabel() || 'Choose field';
	});

	private readonly fieldsResource = resource({
		params: () => this.currentTypeName(),
		loader: ({ params }) => this.catalog().readBooleanExpressionFields(params),
		defaultValue: [] as readonly CatalogFieldDescriptor[],
	});

	protected readonly fields = computed(() => this.fieldsResource.value().filter((field) => field.kind !== 'aggregatePredicate'));

	protected readonly filteredFields = computed(() => {
		const searchTerm = this.searchText().trim().toLowerCase();
		if (searchTerm === '') return this.fields();
		return this.fields().filter((field) => this.labelForField(field.fieldName).toLowerCase().includes(searchTerm));
	});

	protected labelForField(fieldName: string): string {
		return resolveFieldLabel(this.metadata, this.currentResourceName(), fieldName);
	}

	protected breadcrumbLabel(step: DrillStep, index: number): string {
		const owningTypeName = index === 0 ? this.rootTypeName() : this.drillSteps()[index - 1].typeName;
		return resolveFieldLabel(this.metadata, resourceNameFromTypeName(owningTypeName), step.fieldName);
	}

	protected onSearchInput(event: Event): void {
		this.searchText.set((event.target as HTMLInputElement).value);
	}

	protected selectField(field: CatalogFieldDescriptor): void {
		if (field.kind === 'relation') {
			this.drillSteps.update((steps) => [...steps, { fieldName: field.fieldName, typeName: field.booleanExpressionTypeName }]);
			this.searchText.set('');
			return;
		}
		if (field.kind === 'scalar') {
			const fullPath = [...this.drillSteps().map((step) => step.fieldName), field.fieldName];
			this.pathChosen.emit(fullPath);
			this.isOpen.set(false);
			this.drillSteps.set([]);
			this.searchText.set('');
		}
	}

	private async resolveDrillSteps(rootTypeName: string, path: readonly string[]): Promise<readonly DrillStep[]> {
		const leadingSegments = path.slice(0, -1);
		const steps: DrillStep[] = [];
		let currentTypeName = rootTypeName;
		for (const segment of leadingSegments) {
			const fields = await this.catalog().readBooleanExpressionFields(currentTypeName);
			const relationField = fields.find(
				(field): field is CatalogFieldDescriptor & { kind: 'relation' } => field.fieldName === segment && field.kind === 'relation',
			);
			if (!relationField) return [];
			steps.push({ fieldName: relationField.fieldName, typeName: relationField.booleanExpressionTypeName });
			currentTypeName = relationField.booleanExpressionTypeName;
		}
		return steps;
	}

	protected stepBackTo(index: number): void {
		this.drillSteps.update((steps) => steps.slice(0, index));
		this.searchText.set('');
	}
}
