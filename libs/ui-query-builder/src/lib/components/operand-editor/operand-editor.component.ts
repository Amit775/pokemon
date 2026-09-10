import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, inject, input, output, resource, runInInjectionContext, signal } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { SearchSelectComponent, type SearchSelectOption } from '@pokemon-center/ui-pokedex';
import { coerceToGraphQLType, type LiteralScalar, type LiteralValue } from '../../core/model/literal-value';
import type { FilterOperand } from '../../core/model/query-tree';
import type { ValueSource } from '../../metadata/query-builder-metadata';
import { createValueSourceSearch, type ValueOption } from '../../session/value-source-search';

const valueSourceSearchDebounceMilliseconds = 200;

interface ValueSourceSearchTrigger {
	readonly source: ValueSource;
	readonly searchText: string;
}

function parseRawScalar(rawValue: string, argumentTypeName: string): LiteralScalar {
	const trimmedValue = rawValue.trim();
	if (trimmedValue === '') return null;

	if (argumentTypeName === 'Boolean') {
		if (trimmedValue.toLowerCase() === 'true') return true;
		if (trimmedValue.toLowerCase() === 'false') return false;
		return null;
	}

	if (argumentTypeName === 'Int' || argumentTypeName === 'Float') {
		const parsedNumber = Number(trimmedValue);
		return Number.isNaN(parsedNumber) ? null : parsedNumber;
	}

	return trimmedValue;
}

@Component({
	selector: 'pokedex-operand-editor',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkListbox, CdkOption, SearchSelectComponent],
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
				@if (valueSource(); as source) {
					<pokedex-search-select
						class="value-select"
						data-testid="value-select"
						[options]="valueOptions()"
						[value]="literalDisplayValue() || null"
						placeholder="Choose value"
						[loading]="valueQueryLoading()"
						[errorMessage]="valueQueryError()"
						(valueChosen)="chooseValueSourceOption($event)"
						(searchTextChanged)="onValueSearchTextChanged($event, source)"
						(click)="onValueSelectAreaClicked($event, source)"
					/>
				} @else {
					<input
						type="text"
						class="literal-input"
						data-testid="operand-literal-input"
						[value]="literalDisplayValue()"
						(input)="setLiteralValue($any($event.target).value)"
					/>
				}
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
		.value-select { display: flex; }
		.resolved-value { margin: 0; font-size: var(--fs-xs); color: var(--ink-muted); }
	`,
})
export class OperandEditorComponent {
	readonly operand = input.required<FilterOperand>();
	readonly resolvedValue = input<LiteralValue | null>(null);
	readonly argumentTypeName = input<string>('');
	readonly acceptsList = input<boolean>(false);
	readonly valueSource = input<ValueSource | null>(null);
	readonly operandChange = output<FilterOperand>();

	private readonly injector = inject(Injector);
	private readonly destroyRef = inject(DestroyRef);
	private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private searchValueSourceOptions: ((source: ValueSource, searchText: string) => Promise<readonly ValueOption[]>) | null = null;

	protected readonly valueSearchTrigger = signal<ValueSourceSearchTrigger | undefined>(undefined);

	private readonly valueSearchResource = resource({
		params: () => this.valueSearchTrigger(),
		loader: ({ params }) => this.getSearchValueSourceOptions()(params.source, params.searchText),
		defaultValue: [] as readonly ValueOption[],
	});

	private getSearchValueSourceOptions(): (source: ValueSource, searchText: string) => Promise<readonly ValueOption[]> {
		if (!this.searchValueSourceOptions) {
			this.searchValueSourceOptions = runInInjectionContext(this.injector, () => createValueSourceSearch());
		}
		return this.searchValueSourceOptions;
	}

	protected readonly valueOptions = computed<readonly SearchSelectOption[]>(() => {
		if (this.valueSearchResource.error() !== undefined) return [];
		return this.valueSearchResource.value().map((option) => ({ value: option.value, label: option.label }));
	});
	protected readonly valueQueryLoading = computed(() => this.valueSearchResource.isLoading());
	protected readonly valueQueryError = computed(() => {
		const error = this.valueSearchResource.error();
		if (error === undefined) return null;
		return error instanceof Error ? error.message : String(error);
	});

	constructor() {
		this.destroyRef.onDestroy(() => {
			if (this.debounceTimeoutId !== null) clearTimeout(this.debounceTimeoutId);
		});
	}

	protected readonly literalDisplayValue = computed(() => {
		const operand = this.operand();
		if (operand.source !== 'literal' || operand.value === null) return '';
		return Array.isArray(operand.value) ? operand.value.join(', ') : String(operand.value);
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

	protected setLiteralValue(rawValue: string): void {
		const argumentTypeName = this.argumentTypeName();

		if (this.acceptsList()) {
			const segments = rawValue
				.split(',')
				.map((segment) => segment.trim())
				.filter((segment) => segment.length > 0);
			const parsedValues = segments.map((segment) => parseRawScalar(segment, argumentTypeName));

			if (segments.length === 0 || parsedValues.some((parsedValue) => parsedValue === null)) {
				this.operandChange.emit({ source: 'literal', value: null });
				return;
			}

			const coercedValues = parsedValues.map((parsedValue) => coerceToGraphQLType(parsedValue, argumentTypeName) as LiteralScalar);
			this.operandChange.emit({ source: 'literal', value: coercedValues });
			return;
		}

		const parsedValue = parseRawScalar(rawValue, argumentTypeName);
		const value = parsedValue === null ? null : coerceToGraphQLType(parsedValue, argumentTypeName);
		this.operandChange.emit({ source: 'literal', value });
	}

	protected onValueSelectAreaClicked(event: MouseEvent, source: ValueSource): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.closest('[data-testid="search-select-trigger"]')) return;
		if (this.debounceTimeoutId !== null) clearTimeout(this.debounceTimeoutId);
		this.valueSearchTrigger.set({ source, searchText: '' });
	}

	protected onValueSearchTextChanged(searchText: string, source: ValueSource): void {
		if (this.debounceTimeoutId !== null) clearTimeout(this.debounceTimeoutId);
		this.debounceTimeoutId = setTimeout(() => {
			this.debounceTimeoutId = null;
			this.valueSearchTrigger.set({ source, searchText });
		}, valueSourceSearchDebounceMilliseconds);
	}

	protected chooseValueSourceOption(value: string): void {
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
