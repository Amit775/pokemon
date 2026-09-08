import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import type { ColDef } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';
import {
	QUERY_BUILDER_ENDPOINT,
	QueryBuilderComponent,
	QueryBuilderStore,
	buildResolutionDocument,
	collectSubqueries,
	createHttpIntrospectionFetcher,
	createQueryBuilderCatalog,
	discoverResources,
	hasuraDialect,
	type QueryBuilderDialect,
	type CollectedSubquery,
	type CompiledQuery,
	type LiteralValue,
	type QueryBuilderCatalog,
	type ResourceDescriptor,
	type SelectionNode,
} from '@pokemon-center/ui-query-builder';
import { UiDataGridComponent } from '@pokemon-center/ui-pokedex';

type QueryExplorerRow = Record<string, unknown>;
type QueryBuilderStoreInstance = InstanceType<typeof QueryBuilderStore>;

interface GraphQLErrorEntry {
	readonly message: string;
}

interface GraphQLPayload<TData> {
	readonly data?: TData;
	readonly errors?: readonly GraphQLErrorEntry[];
}

function parseGraphQLPayload<TData>(raw: unknown): TData {
	const payload = raw as GraphQLPayload<TData>;
	if (payload.errors?.length) {
		throw new Error(payload.errors.map((error) => error.message).join('; '));
	}
	return payload.data as TData;
}

function readNestedValue(source: unknown, path: readonly string[]): unknown {
	let current = source;
	for (const key of path) {
		if (current == null) return null;
		current = (current as Record<string, unknown>)[key];
	}
	return current ?? null;
}

function extractResolvedValue(data: Record<string, unknown>, entry: CollectedSubquery): LiteralValue {
	const fieldValue = data[entry.variableName];

	if (entry.subquery.selector.kind === 'aggregate') {
		const aggregate = (fieldValue as { aggregate?: Record<string, unknown> } | null | undefined)?.aggregate ?? null;
		if (entry.subquery.selector.functionName === 'count') {
			return (aggregate?.['count'] as LiteralValue) ?? null;
		}
		return (readNestedValue(aggregate?.[entry.subquery.selector.functionName] ?? null, entry.subquery.selector.fieldPath) as LiteralValue) ?? null;
	}

	const firstRow = Array.isArray(fieldValue) ? fieldValue[0] : null;
	return (readNestedValue(firstRow, entry.subquery.selector.fieldPath) as LiteralValue) ?? null;
}

function inferVariableTypeName(value: LiteralValue): string {
	if (typeof value === 'boolean') return 'Boolean';
	if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Float';
	return 'String';
}

function resolveVariableTypeName(
	entry: CollectedSubquery,
	comparisonTypeNames: ReadonlyMap<string, string>,
	dialect: QueryBuilderDialect,
	value: LiteralValue,
): string {
	const comparisonTypeName = entry.nodeIds.map((nodeId) => comparisonTypeNames.get(nodeId)).find((typeName) => typeName);
	return comparisonTypeName ? dialect.scalarTypeNameFromComparisonTypeName(comparisonTypeName) : inferVariableTypeName(value);
}

function collectColumnDefs(node: SelectionNode, path: readonly string[], columns: ColDef<QueryExplorerRow>[]): void {
	const currentPath = node.fieldName.length > 0 ? [...path, node.fieldName] : path;

	if (node.children.length === 0) {
		if (currentPath.length === 0) return;
		if (currentPath.length === 1) {
			columns.push({ field: currentPath[0], headerName: currentPath[0] });
			return;
		}
		columns.push({
			colId: currentPath.join('.'),
			headerName: currentPath.join(' › '),
			valueGetter: (parameters) => readNestedValue(parameters.data, currentPath),
		});
		return;
	}

	for (const child of node.children) collectColumnDefs(child, currentPath, columns);
}

function selectionToColumnDefs(selection: SelectionNode): ColDef<QueryExplorerRow>[] {
	const columns: ColDef<QueryExplorerRow>[] = [];
	for (const child of selection.children) collectColumnDefs(child, [], columns);
	return columns;
}

@Component({
	selector: 'pokedex-query-explorer',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [QueryBuilderComponent, UiDataGridComponent],
	template: `
		<div class="query-explorer">
			<h1>Query explorer</h1>

			@if (resourcesError()) {
				<p class="banner banner-error" role="alert" data-testid="resources-error">Could not load the schema: {{ resourcesError() }}</p>
			}

			<pokedex-query-builder [resources]="resources()" [catalog]="catalog" (compiled)="onCompiled($event)" />

			@if (resolutionError()) {
				<p class="banner banner-error" role="alert" data-testid="resolution-error">{{ resolutionError() }}</p>
			}

			@if (compiledQuery()) {
				<section class="results">
					@if (queryResultResource.isLoading()) {
						<p class="banner banner-info" data-testid="query-loading">Running query…</p>
					}
					@if (queryResultResource.error(); as queryError) {
						<p class="banner banner-error" role="alert" data-testid="query-error">{{ errorMessage(queryError) }}</p>
					} @else if (queryResultResource.hasValue() && rows().length === 0) {
						<p class="banner banner-info" data-testid="query-empty">No rows matched this query.</p>
					} @else if (rows().length > 0) {
						<pokedex-data-grid [rowData]="rows()" [columnDefs]="columnDefs()" />
					}
				</section>
			}
		</div>
	`,
	styles: `
		:host {
			display: block;
			padding: var(--s-5);
		}
		h1 {
			color: var(--ink);
		}
		.query-explorer {
			display: flex;
			flex-direction: column;
			gap: var(--s-4);
		}
		.banner {
			padding: var(--s-2) var(--s-3);
			border-radius: var(--r-md);
			font-size: var(--fs-sm);
		}
		.banner-error {
			background: var(--crit);
			color: var(--accent-ink);
		}
		.banner-info {
			background: var(--surface-sunken);
			color: var(--ink-muted);
		}
		.results {
			display: flex;
			flex-direction: column;
			gap: var(--s-2);
		}
		pokedex-data-grid {
			--pokedex-grid-height: 32rem;
		}
	`,
})
export class QueryExplorerComponent {
	private readonly httpClient = inject(HttpClient);
	private readonly endpoint = inject(QUERY_BUILDER_ENDPOINT);

	protected readonly catalog: QueryBuilderCatalog = createQueryBuilderCatalog(createHttpIntrospectionFetcher(), hasuraDialect);
	protected readonly resources = signal<readonly ResourceDescriptor[]>([]);
	protected readonly resourcesError = signal<string | null>(null);

	private readonly queryBuilderStore = viewChild(QueryBuilderComponent, { read: QueryBuilderStore });
	private readonly resolvingVariableNames = new Set<string>();

	protected readonly resolutionError = signal<string | null>(null);
	protected readonly compiledQuery = signal<CompiledQuery | null>(null);
	protected readonly resourceName = signal<string | null>(null);
	protected readonly columnDefs = signal<ColDef<QueryExplorerRow>[]>([]);

	protected readonly queryResultResource = httpResource<Record<string, QueryExplorerRow[]>>(
		() => {
			const compiled = this.compiledQuery();
			if (!compiled) return undefined;
			return { url: this.endpoint, method: 'POST', body: { query: compiled.document, variables: compiled.variables } };
		},
		{ parse: parseGraphQLPayload },
	);

	protected readonly rows = computed<QueryExplorerRow[]>(() => {
		const data = this.queryResultResource.value();
		const resourceName = this.resourceName();
		if (!data || !resourceName) return [];
		const rows = data[resourceName];
		return Array.isArray(rows) ? rows : [];
	});

	constructor() {
		discoverResources().then(
			(resources) => this.resources.set(resources),
			(error) => this.resourcesError.set(error instanceof Error ? error.message : 'Failed to load the schema.'),
		);

		effect(() => {
			const store = this.queryBuilderStore();
			if (!store) return;

			const collected = collectSubqueries(store.filter());
			const resolvedValues = store.resolvedValues();
			const unresolved = collected.filter(
				(entry) => !resolvedValues.has(entry.variableName) && !this.resolvingVariableNames.has(entry.variableName),
			);
			if (unresolved.length === 0) return;

			untracked(() => this.resolveSubqueries(store, unresolved));
		});
	}

	protected onCompiled(compiled: CompiledQuery): void {
		const store = this.queryBuilderStore();
		if (store) {
			this.columnDefs.set(selectionToColumnDefs(store.selection()));
			this.resourceName.set(store.resourceName());
		}
		this.compiledQuery.set(compiled);
	}

	protected errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : 'The query could not be run.';
	}

	private async resolveSubqueries(store: QueryBuilderStoreInstance, unresolved: readonly CollectedSubquery[]): Promise<void> {
		for (const entry of unresolved) this.resolvingVariableNames.add(entry.variableName);

		try {
			const document = buildResolutionDocument(unresolved, hasuraDialect);
			const response = await firstValueFrom(
				this.httpClient.post<GraphQLPayload<Record<string, unknown>>>(this.endpoint, { query: document, variables: {} }),
			);
			if (response.errors?.length) {
				throw new Error(response.errors.map((error) => error.message).join('; '));
			}
			const data = response.data ?? {};
			const comparisonTypeNames = store.comparisonTypeNames();
			for (const entry of unresolved) {
				const value = extractResolvedValue(data, entry);
				store.setResolvedValue(entry.variableName, value, resolveVariableTypeName(entry, comparisonTypeNames, hasuraDialect, value));
			}
			this.resolutionError.set(null);
		} catch (error) {
			this.resolutionError.set(error instanceof Error ? error.message : 'Failed to resolve comparison values.');
		} finally {
			for (const entry of unresolved) this.resolvingVariableNames.delete(entry.variableName);
		}
	}
}
