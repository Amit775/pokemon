import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, resource } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { form, required, schema, type Schema } from '@angular/forms/signals';
import { SearchSelectComponent, type SearchSelectOption } from '@pokemon-center/ui-pokedex';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { OperatorDescriptor } from '../../core/metadata/read-operators';
import { type FilterOperand, type FilterRule, type QueryBuilderNode } from '../../core/model/query-tree';
import { expandShortcut } from '../../metadata/expand-shortcut';
import { humanizeName } from '../../metadata/humanize-name';
import { QUERY_BUILDER_METADATA, type FilterShortcut } from '../../metadata/query-builder-metadata';
import { resolveFieldLabel } from '../../metadata/resolve-labels';
import { FieldPathPickerComponent } from '../field-path-picker/field-path-picker.component';
import { OperandEditorComponent } from '../operand-editor/operand-editor.component';

const boolExpSuffixPattern = /_bool_exp$/;

const filterRuleSchema: Schema<FilterRule> = schema<FilterRule>((rulePath) => {
	required(rulePath.operatorName, { message: 'Choose an operator to complete this rule.' });
});

async function resolvesToScalarLeaf(catalog: QueryBuilderCatalog, rootTypeName: string, fieldPath: readonly string[]): Promise<boolean> {
	if (fieldPath.length === 0) return false;

	let currentTypeName = rootTypeName;
	for (const [index, fieldName] of fieldPath.entries()) {
		const fields = await catalog.readBooleanExpressionFields(currentTypeName);
		const descriptor = fields.find((field) => field.fieldName === fieldName);
		if (!descriptor) return false;

		const isLastSegment = index === fieldPath.length - 1;
		if (isLastSegment) return descriptor.kind === 'scalar';
		if (descriptor.kind !== 'relation') return false;

		currentTypeName = descriptor.booleanExpressionTypeName;
	}
	return false;
}

@Component({
	selector: 'pokedex-filter-rule',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkListbox, CdkOption, FieldPathPickerComponent, OperandEditorComponent, SearchSelectComponent],
	template: `
		@if (pinned()) {
			<div class="pinned-condition" data-testid="pinned-condition">{{ pinnedLabel() }}</div>
		} @else {
			<div class="filter-rule">
				<div class="field-select" data-testid="field-select">
					<pokedex-search-select
						[options]="shortcutOptions()"
						[value]="selectedShortcutValue()"
						placeholder="Choose field"
						(valueChosen)="chooseShortcut($event)"
					/>
					<pokedex-field-path-picker
						[catalog]="catalog()"
						[rootTypeName]="rootTypeName()"
						[path]="ruleModel().fieldPath"
						triggerTestId="field-advanced"
						triggerLabel="Advanced"
						(pathChosen)="setFieldPath($event)"
					/>
				</div>

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
					[valueSource]="selectedShortcut()?.valueSource ?? null"
					[catalog]="catalog()"
					(operandChange)="setOperand($event)"
				/>
			</div>
		}
	`,
	styles: `
		:host { display: block; }
		.pinned-condition { font-size: var(--fs-sm); color: var(--ink-muted); padding: var(--s-1) var(--s-2); }
		.filter-rule { display: flex; flex-direction: column; gap: var(--s-2); }
		.field-select { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
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
	readonly pinned = input<boolean>(false);
	readonly ruleChange = output<FilterRule>();
	readonly shortcutChosen = output<QueryBuilderNode>();

	private readonly metadata = inject(QUERY_BUILDER_METADATA);

	protected readonly ruleModel = linkedSignal(() => this.rule());
	protected readonly ruleForm = form(this.ruleModel, filterRuleSchema);
	protected readonly operatorIssues = computed(() => this.ruleForm.operatorName().errors());

	protected readonly resourceName = computed(() => this.rootTypeName().replace(boolExpSuffixPattern, ''));

	private readonly curatedShortcuts = computed(
		() => this.metadata.resources.find((resourceMetadata) => resourceMetadata.resourceName === this.resourceName())?.shortcuts ?? [],
	);

	private readonly resolvableShortcutsResource = resource({
		params: () => ({ catalog: this.catalog(), rootTypeName: this.rootTypeName(), shortcuts: this.curatedShortcuts() }),
		loader: ({ params }) => this.resolveShortcuts(params.catalog, params.rootTypeName, params.shortcuts),
		defaultValue: [] as readonly FilterShortcut[],
	});

	protected readonly shortcuts = computed(() => this.resolvableShortcutsResource.value());

	protected readonly shortcutOptions = computed<readonly SearchSelectOption[]>(() =>
		this.shortcuts().map((shortcut) => ({ value: shortcut.shortcutId, label: shortcut.displayName })),
	);

	protected readonly selectedShortcut = computed(() => {
		const currentFieldPath = this.ruleModel().fieldPath.join('.');
		return this.shortcuts().find((shortcut) => !shortcut.scope && shortcut.fieldPath.join('.') === currentFieldPath) ?? null;
	});

	protected readonly selectedShortcutValue = computed(() => this.selectedShortcut()?.shortcutId ?? null);

	protected readonly pinnedLabel = computed(() => {
		const currentRule = this.ruleModel();
		const subjectFieldName = currentRule.fieldPath[0] ?? '';
		const label = resolveFieldLabel(this.metadata, this.resourceName(), subjectFieldName);
		const value = currentRule.operand.source === 'literal' ? currentRule.operand.value : null;
		return `${label} is ${humanizeName(String(value ?? ''))}`;
	});

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

	protected chooseShortcut(shortcutId: string): void {
		const shortcut = this.shortcuts().find((candidate) => candidate.shortcutId === shortcutId);
		if (!shortcut) return;
		this.shortcutChosen.emit(expandShortcut(shortcut));
	}

	private async resolveShortcuts(
		catalog: QueryBuilderCatalog,
		rootTypeName: string,
		shortcuts: readonly FilterShortcut[],
	): Promise<readonly FilterShortcut[]> {
		const resolutions = await Promise.all(
			shortcuts.map(async (shortcut) => {
				const fullPath = shortcut.scope ? [...shortcut.scope.relationPath, ...shortcut.fieldPath] : shortcut.fieldPath;
				const resolvable = await resolvesToScalarLeaf(catalog, rootTypeName, fullPath);
				return resolvable ? shortcut : null;
			}),
		);
		return resolutions.filter((shortcut): shortcut is FilterShortcut => shortcut !== null);
	}
}
