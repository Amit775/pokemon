import { InjectionToken } from '@angular/core';
import type { LiteralValue } from '../core/model/literal-value';

export interface ValueSource {
	readonly resourceName: string;
	readonly valueFieldName: string;
	readonly searchFieldName?: string;
}

export interface PinnedRule {
	readonly fieldPath: readonly string[];
	readonly operatorName: string;
	readonly value: LiteralValue;
}

export interface RelationScopeTemplate {
	readonly relationPath: readonly string[];
	readonly quantifier: 'some' | 'none';
	readonly pinnedRules: readonly PinnedRule[];
}

export interface FilterShortcut {
	readonly shortcutId: string;
	readonly displayName: string;
	readonly fieldPath: readonly string[];
	readonly scope?: RelationScopeTemplate;
	readonly valueSource?: ValueSource;
}

export interface ResourceMetadata {
	readonly resourceName: string;
	readonly displayName: string;
	readonly group: string;
	readonly priority: number;
	readonly shortcuts: readonly FilterShortcut[];
	readonly defaultSelectionFieldNames?: readonly string[];
	readonly fieldLabelOverrides?: Readonly<Record<string, string>>;
}

export interface QueryBuilderMetadata {
	readonly resources: readonly ResourceMetadata[];
	readonly resourceLabels: Readonly<Record<string, string>>;
	readonly fieldLabels: Readonly<Record<string, string>>;
}

export const emptyQueryBuilderMetadata: QueryBuilderMetadata = { resources: [], resourceLabels: {}, fieldLabels: {} };

export const QUERY_BUILDER_METADATA = new InjectionToken<QueryBuilderMetadata>('QUERY_BUILDER_METADATA', {
	providedIn: 'root',
	factory: () => emptyQueryBuilderMetadata,
});

export const QUERY_BUILDER_ENDPOINT = new InjectionToken<string>('QUERY_BUILDER_ENDPOINT');
