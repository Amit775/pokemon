import { InjectionToken } from '@angular/core';

export interface ResourceOverlay {
	readonly displayLabel?: string;
	readonly defaultSelectionFieldNames?: readonly string[];
	readonly pinnedFieldNames?: readonly string[];
	readonly hiddenFieldNames?: readonly string[];
}

export interface QueryBuilderOverlay {
	readonly resources: Readonly<Record<string, ResourceOverlay>>;
	readonly fieldLabels: Readonly<Record<string, string>>;
}

export const emptyQueryBuilderOverlay: QueryBuilderOverlay = { resources: {}, fieldLabels: {} };

export const QUERY_BUILDER_OVERLAY = new InjectionToken<QueryBuilderOverlay>('QUERY_BUILDER_OVERLAY', {
	providedIn: 'root',
	factory: () => emptyQueryBuilderOverlay,
});

export const QUERY_BUILDER_ENDPOINT = new InjectionToken<string>('QUERY_BUILDER_ENDPOINT');
