import { ChangeDetectionStrategy, Component, computed, input, output, resource, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { CatalogFieldDescriptor } from '../../core/metadata/introspection-types';

interface DrillStep {
	readonly fieldName: string;
	readonly typeName: string;
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
				data-testid="field-path-trigger"
				(click)="isOpen.set(!isOpen())"
			>
				{{ triggerLabel() }}
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
								{{ step.fieldName }}
							</button>
						}
					</div>
					<ul class="field-list">
						@for (field of fields(); track field.fieldName) {
							<li>
								<button type="button" class="field-option" data-testid="field-option" [attr.data-field-kind]="field.kind" (click)="selectField(field)">
									{{ field.fieldName }}
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
			min-width: 12rem;
			max-height: 16rem;
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
		.trigger:focus-visible, .breadcrumb-step:focus-visible, .field-option:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	`,
})
export class FieldPathPickerComponent {
	readonly catalog = input.required<QueryBuilderCatalog>();
	readonly rootTypeName = input.required<string>();
	readonly path = input<readonly string[]>([]);
	readonly pathChosen = output<readonly string[]>();

	protected readonly isOpen = signal(false);
	protected readonly drillSteps = signal<readonly DrillStep[]>([]);

	protected readonly currentTypeName = computed(() => {
		const steps = this.drillSteps();
		return steps.length > 0 ? steps[steps.length - 1].typeName : this.rootTypeName();
	});

	protected readonly triggerLabel = computed(() => (this.path().length > 0 ? this.path().join('.') : 'Choose field'));

	private readonly fieldsResource = resource({
		params: () => this.currentTypeName(),
		loader: ({ params }) => this.catalog().readBooleanExpressionFields(params),
		defaultValue: [] as readonly CatalogFieldDescriptor[],
	});

	protected readonly fields = computed(() => this.fieldsResource.value());

	protected selectField(field: CatalogFieldDescriptor): void {
		if (field.kind === 'relation') {
			this.drillSteps.update((steps) => [...steps, { fieldName: field.fieldName, typeName: field.booleanExpressionTypeName }]);
			return;
		}
		if (field.kind === 'scalar') {
			const fullPath = [...this.drillSteps().map((step) => step.fieldName), field.fieldName];
			this.pathChosen.emit(fullPath);
			this.isOpen.set(false);
			this.drillSteps.set([]);
		}
	}

	protected stepBackTo(index: number): void {
		this.drillSteps.update((steps) => steps.slice(0, index));
	}
}
