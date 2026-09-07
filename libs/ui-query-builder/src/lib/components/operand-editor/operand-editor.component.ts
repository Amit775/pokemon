import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import type { LiteralValue } from '../../core/model/literal-value';
import type { FilterOperand } from '../../core/model/query-tree';

@Component({
	selector: 'pokedex-operand-editor',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkListbox, CdkOption],
	template: `
		<div class="operand-editor">
			<ul
				cdkListbox
				class="source-toggle"
				aria-label="Operand source"
				[cdkListboxValue]="[operand().source]"
				(cdkListboxValueChange)="setSource($event.value[0])"
			>
				<li cdkOption="literal" class="source-option" data-testid="operand-source-literal">Literal</li>
				<li cdkOption="subquery" class="source-option" data-testid="operand-source-subquery">Subquery</li>
			</ul>

			@if (operand().source === 'literal') {
				<input
					type="text"
					class="literal-input"
					data-testid="operand-literal-input"
					[value]="literalDisplayValue()"
					(input)="setLiteralValue($any($event.target).value)"
				/>
			}

			@if (operand().source === 'subquery') {
				<div class="subquery-editor" data-testid="operand-subquery-editor">
					<input
						type="text"
						placeholder="resource"
						class="subquery-resource-input"
						data-testid="operand-subquery-resource"
						[value]="subqueryResourceName()"
						(input)="setSubqueryResourceName($any($event.target).value)"
					/>
					<input
						type="text"
						placeholder="field.path"
						class="subquery-field-path-input"
						data-testid="operand-subquery-field-path"
						[value]="subqueryFieldPath()"
						(input)="setSubqueryFieldPath($any($event.target).value)"
					/>
					@if (resolvedValue() !== null) {
						<p class="resolved-value" data-testid="operand-resolved-value">{{ subqueryDescription() }}: {{ resolvedValue() }}</p>
					}
				</div>
			}
		</div>
	`,
	styles: `
		:host { display: block; }
		.operand-editor { display: flex; flex-direction: column; gap: var(--s-2); }
		.source-toggle { display: flex; gap: var(--s-1); list-style: none; margin: 0; padding: 0; }
		.source-option {
			font-size: var(--fs-xs);
			padding: var(--s-1) var(--s-3);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			color: var(--ink-muted);
			cursor: pointer;
		}
		.source-option[aria-selected='true'] {
			background: var(--accent-soft);
			color: var(--accent);
			border-color: var(--accent);
		}
		input {
			font: inherit;
			font-size: var(--fs-sm);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-sm);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink);
		}
		.source-option:focus-visible, input:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
		.subquery-editor { display: flex; flex-direction: column; gap: var(--s-1); }
		.resolved-value { margin: 0; font-size: var(--fs-xs); color: var(--ink-muted); }
	`,
})
export class OperandEditorComponent {
	readonly operand = input.required<FilterOperand>();
	readonly resolvedValue = input<LiteralValue | null>(null);
	readonly operandChange = output<FilterOperand>();

	protected readonly literalDisplayValue = computed(() => {
		const operand = this.operand();
		return operand.source === 'literal' && operand.value !== null ? String(operand.value) : '';
	});

	protected readonly subqueryResourceName = computed(() => {
		const operand = this.operand();
		return operand.source === 'subquery' ? operand.subquery.resourceName : '';
	});

	protected readonly subqueryFieldPath = computed(() => {
		const operand = this.operand();
		return operand.source === 'subquery' ? operand.subquery.selector.fieldPath.join('.') : '';
	});

	protected readonly subqueryDescription = computed(() => {
		const operand = this.operand();
		if (operand.source !== 'subquery') return '';
		const selector = operand.subquery.selector;
		const fieldPath = selector.fieldPath.join('.');
		return selector.kind === 'aggregate' ? `${selector.functionName} of ${fieldPath} on ${operand.subquery.resourceName}` : `${fieldPath} on ${operand.subquery.resourceName}`;
	});

	protected setSource(source: FilterOperand['source']): void {
		if (source === this.operand().source) return;
		if (source === 'literal') {
			this.operandChange.emit({ source: 'literal', value: null });
			return;
		}
		this.operandChange.emit({
			source: 'subquery',
			subquery: { resourceName: '', filter: null, selector: { kind: 'row', fieldPath: [], ordering: null } },
		});
	}

	protected setLiteralValue(value: string): void {
		this.operandChange.emit({ source: 'literal', value });
	}

	protected setSubqueryResourceName(resourceName: string): void {
		const operand = this.operand();
		if (operand.source !== 'subquery') return;
		this.operandChange.emit({ source: 'subquery', subquery: { ...operand.subquery, resourceName } });
	}

	protected setSubqueryFieldPath(rawFieldPath: string): void {
		const operand = this.operand();
		if (operand.source !== 'subquery') return;
		const fieldPath = rawFieldPath
			.split('.')
			.map((segment) => segment.trim())
			.filter((segment) => segment.length > 0);
		this.operandChange.emit({
			source: 'subquery',
			subquery: { ...operand.subquery, selector: { ...operand.subquery.selector, fieldPath } },
		});
	}
}
