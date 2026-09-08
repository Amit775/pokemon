import { ChangeDetectionStrategy, Component, computed, effect, input, linkedSignal, output, resource } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { form, required, schema, type Schema } from '@angular/forms/signals';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { OperatorDescriptor } from '../../core/metadata/read-operators';
import type { FilterOperand, FilterRule } from '../../core/model/query-tree';
import { FieldPathPickerComponent } from '../field-path-picker/field-path-picker.component';
import { OperandEditorComponent } from '../operand-editor/operand-editor.component';

const filterRuleSchema: Schema<FilterRule> = schema<FilterRule>((rulePath) => {
	required(rulePath.operatorName, { message: 'Choose an operator to complete this rule.' });
});

@Component({
	selector: 'pokedex-filter-rule',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkListbox, CdkOption, FieldPathPickerComponent, OperandEditorComponent],
	template: `
		<div class="filter-rule">
			<pokedex-field-path-picker
				[catalog]="catalog()"
				[rootTypeName]="rootTypeName()"
				[path]="ruleModel().fieldPath"
				(pathChosen)="setFieldPath($event)"
			/>

			<ul
				cdkListbox
				class="operator-list"
				aria-label="Operator"
				[cdkListboxValue]="selectedOperatorValues()"
				(cdkListboxValueChange)="setOperator($event.value[0] ?? '')"
			>
				@for (operator of operators(); track operator.operatorName) {
					<li [cdkOption]="operator.operatorName" class="operator-option" data-testid="operator-option">
						{{ operator.operatorName }}
					</li>
				}
			</ul>

			@if (operatorIssues().length > 0) {
				<p class="rule-issue" data-testid="rule-issue" role="alert">{{ operatorIssues()[0].message }}</p>
			}

			<pokedex-operand-editor
				[operand]="ruleModel().operand"
				[argumentTypeName]="selectedOperatorDescriptor()?.argumentTypeName ?? ''"
				[acceptsList]="selectedOperatorDescriptor()?.acceptsList ?? false"
				(operandChange)="setOperand($event)"
			/>
		</div>
	`,
	styles: `
		:host { display: block; }
		.filter-rule { display: flex; flex-direction: column; gap: var(--s-2); }
		.operator-list { display: flex; flex-wrap: wrap; gap: var(--s-1); list-style: none; margin: 0; padding: 0; }
		.operator-option {
			font-size: var(--fs-xs);
			font-family: var(--font-mono);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-sm);
			border: 1px solid var(--line);
			color: var(--ink-muted);
			cursor: pointer;
		}
		.operator-option[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
		.operator-option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
		.rule-issue { margin: 0; font-size: var(--fs-xs); color: var(--crit); }
	`,
})
export class FilterRuleComponent {
	readonly catalog = input.required<QueryBuilderCatalog>();
	readonly rule = input.required<FilterRule>();
	readonly comparisonTypeName = input.required<string>();
	readonly rootTypeName = input<string>('');
	readonly ruleChange = output<FilterRule>();

	protected readonly ruleModel = linkedSignal(() => this.rule());
	protected readonly ruleForm = form(this.ruleModel, filterRuleSchema);
	protected readonly operatorIssues = computed(() => this.ruleForm.operatorName().errors());

	private readonly operatorsResource = resource({
		params: () => this.comparisonTypeName(),
		loader: ({ params }) => this.catalog().readOperatorsForComparisonType(params),
		defaultValue: [] as readonly OperatorDescriptor[],
	});

	protected readonly operators = computed(() => this.operatorsResource.value());
	protected readonly selectedOperatorValues = computed(() => {
		const operatorName = this.ruleModel().operatorName;
		return this.operators().some((operator) => operator.operatorName === operatorName) ? [operatorName] : [];
	});
	protected readonly selectedOperatorDescriptor = computed(() => {
		const operatorName = this.ruleModel().operatorName;
		return this.operators().find((operator) => operator.operatorName === operatorName) ?? null;
	});

	constructor() {
		effect(() => this.ruleChange.emit(this.ruleModel()));
	}

	protected setFieldPath(fieldPath: readonly string[]): void {
		this.ruleModel.update((rule) => ({ ...rule, fieldPath }));
	}

	protected setOperator(operatorName: string): void {
		this.ruleModel.update((rule) => ({ ...rule, operatorName }));
	}

	protected setOperand(operand: FilterOperand): void {
		this.ruleModel.update((rule) => ({ ...rule, operand }));
	}
}
