import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, inject, input, output, resource, runInInjectionContext, signal } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { SearchSelectComponent, type SearchSelectOption } from '@pokemon-center/ui-pokedex';
import { coerceToGraphQLType, type LiteralScalar, type LiteralValue } from '../../core/model/literal-value';
import type { QueryBuilderCatalog } from '../../core/metadata/catalog';
import type { OutputFieldDescriptor } from '../../core/metadata/introspection-types';
import type { ResourceDescriptor } from '../../core/metadata/read-resources';
import type { FilterOperand } from '../../core/model/query-tree';
import { QUERY_BUILDER_METADATA, type ValueSource } from '../../metadata/query-builder-metadata';
import { resolveFieldLabel, resolveResourceLabel } from '../../metadata/resolve-labels';
import { discoverResources } from '../../session/http-introspection-fetcher';
import { createValueSourceSearch, type ValueOption } from '../../session/value-source-search';

const valueSourceSearchDebounceMilliseconds = 200;

const emptyQueryBuilderCatalog: QueryBuilderCatalog = {
	readBooleanExpressionFields: async () => [],
	readOperatorsForComparisonType: async () => [],
	readOutputObjectFields: async () => [],
};

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
						[value]="selectedValueSourceValue()"
						placeholder="Choose value"
						[loading]="valueQueryLoading()"
						[errorMessage]="valueQueryError()"
						(valueChosen)="chooseValueSourceOption($event)"
						(searchTextChanged)="onValueSearchTextChanged($event, source)"
						(click)="onValueSelectAreaClicked($event, source)"
					/>
					@if (acceptsList()) {
						<ul class="value-chips" data-testid="value-chip-list">
							@for (chosenValue of chosenListValues(); track chosenValue) {
								<li class="value-chip" data-testid="value-chip">
									{{ valueChipLabel(chosenValue) }}
									<button type="button" class="remove-value" data-testid="remove-value" (click)="removeListValue(chosenValue)">×</button>
								</li>
							}
						</ul>
					}
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
					<div class="subquery-resource-picker" data-testid="operand-subquery-resource">
						<pokedex-search-select
							class="subquery-select"
							[options]="subqueryResourceOptions()"
							[value]="subqueryResourceName() || null"
							placeholder="Choose resource"
							[loading]="subqueryResourceLoading()"
							[errorMessage]="subqueryResourceError()"
							(valueChosen)="setSubqueryResourceName($event)"
							(click)="onSubqueryResourceAreaClicked($event)"
						/>
					</div>
					<div class="subquery-field-path-picker" data-testid="operand-subquery-field-path">
						<pokedex-search-select
							class="subquery-select"
							[options]="subqueryFieldOptions()"
							[value]="subqueryFieldPath() || null"
							placeholder="Choose field"
							[errorMessage]="subqueryFieldError()"
							(valueChosen)="setSubqueryFieldPath($event)"
							(click)="onSubqueryFieldAreaClicked($event)"
						/>
					</div>
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
		.value-chips { display: flex; flex-wrap: wrap; gap: var(--s-1); list-style: none; margin: 0; padding: 0; }
		.value-chip {
			display: inline-flex;
			align-items: center;
			gap: var(--s-1);
			font-size: var(--fs-xs);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			background: var(--accent-soft);
			color: var(--accent);
		}
		.remove-value { background: none; border: none; color: inherit; cursor: pointer; font-size: var(--fs-sm); line-height: 1; padding: 0; }
		.remove-value:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
		.subquery-select { display: flex; }
		.resolved-value { margin: 0; font-size: var(--fs-xs); color: var(--ink-muted); }
	`,
})
export class OperandEditorComponent {
	readonly operand = input.required<FilterOperand>();
	readonly resolvedValue = input<LiteralValue | null>(null);
	readonly argumentTypeName = input<string>('');
	readonly acceptsList = input<boolean>(false);
	readonly valueSource = input<ValueSource | null>(null);
	readonly catalog = input<QueryBuilderCatalog>(emptyQueryBuilderCatalog);
	readonly operandChange = output<FilterOperand>();

	private readonly injector = inject(Injector);
	private readonly destroyRef = inject(DestroyRef);
	private readonly metadata = inject(QUERY_BUILDER_METADATA);
	private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private searchValueSourceOptions: ((source: ValueSource, searchText: string) => Promise<readonly ValueOption[]>) | null = null;
	private discoverResourcesFunction: (() => Promise<readonly ResourceDescriptor[]>) | null = null;

	protected readonly valueSearchTrigger = signal<ValueSourceSearchTrigger | undefined>(undefined);

	private readonly chosenValueLabels = signal<ReadonlyMap<string, string>>(new Map());

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

	private getDiscoverResources(): () => Promise<readonly ResourceDescriptor[]> {
		if (!this.discoverResourcesFunction) {
			this.discoverResourcesFunction = () => runInInjectionContext(this.injector, () => discoverResources());
		}
		return this.discoverResourcesFunction;
	}

	protected readonly subqueryResourceRequested = signal(false);

	private readonly resourceListResource = resource({
		params: () => (this.subqueryResourceRequested() ? {} : undefined),
		loader: () => this.getDiscoverResources()(),
		defaultValue: [] as readonly ResourceDescriptor[],
	});

	protected readonly subqueryResourceOptions = computed<readonly SearchSelectOption[]>(() => {
		if (this.resourceListResource.error() !== undefined) return [];
		return this.resourceListResource
			.value()
			.map((resourceDescriptor) => ({
				value: resourceDescriptor.resourceName,
				label: resolveResourceLabel(this.metadata, resourceDescriptor.resourceName),
			}))
			.sort((first, second) => first.label.localeCompare(second.label));
	});

	protected readonly subqueryResourceLoading = computed(() => this.resourceListResource.isLoading());
	protected readonly subqueryResourceError = computed(() => {
		const error = this.resourceListResource.error();
		if (error === undefined) return null;
		return error instanceof Error ? error.message : String(error);
	});

	protected readonly subqueryFieldsRequested = signal(false);

	private readonly subqueryFieldsResource = resource({
		params: () => {
			if (!this.subqueryFieldsRequested()) return undefined;
			const resourceName = this.subqueryResourceName();
			return resourceName ? { catalog: this.catalog(), resourceName } : undefined;
		},
		loader: ({ params }) => params.catalog.readOutputObjectFields(params.resourceName),
		defaultValue: [] as readonly OutputFieldDescriptor[],
	});

	protected readonly subqueryFieldOptions = computed<readonly SearchSelectOption[]>(() => {
		const resourceName = this.subqueryResourceName();
		return this.subqueryFieldsResource
			.value()
			.map((field) => ({ value: field.fieldName, label: resolveFieldLabel(this.metadata, resourceName, field.fieldName) }));
	});

	protected readonly subqueryFieldError = computed(() => {
		const error = this.subqueryFieldsResource.error();
		if (error === undefined) return null;
		return error instanceof Error ? error.message : String(error);
	});

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

	protected readonly chosenListValues = computed<readonly string[]>(() => {
		const operand = this.operand();
		if (operand.source !== 'literal' || operand.value === null) return [];
		const values = Array.isArray(operand.value) ? operand.value : [operand.value];
		return values.filter((entry) => entry !== null).map((entry) => String(entry));
	});

	protected readonly selectedValueSourceValue = computed(() => (this.acceptsList() ? null : this.literalDisplayValue() || null));

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
		const chosenLabel = this.valueOptions().find((option) => option.value === value)?.label;
		if (chosenLabel !== undefined) this.chosenValueLabels.update((labels) => new Map(labels).set(value, chosenLabel));

		if (!this.acceptsList()) {
			this.operandChange.emit({ source: 'literal', value });
			return;
		}

		const currentValues = this.chosenListValues();
		if (currentValues.includes(value)) return;
		this.operandChange.emit({ source: 'literal', value: [...currentValues, value] });
	}

	protected removeListValue(value: string): void {
		const remainingValues = this.chosenListValues().filter((entry) => entry !== value);
		this.operandChange.emit({ source: 'literal', value: remainingValues.length === 0 ? null : remainingValues });
	}

	protected valueChipLabel(value: string): string {
		return this.chosenValueLabels().get(value) ?? this.valueOptions().find((option) => option.value === value)?.label ?? value;
	}

	protected onSubqueryResourceAreaClicked(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.closest('[data-testid="search-select-trigger"]')) return;
		this.subqueryResourceRequested.set(true);
	}

	protected onSubqueryFieldAreaClicked(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.closest('[data-testid="search-select-trigger"]')) return;
		this.subqueryFieldsRequested.set(true);
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
