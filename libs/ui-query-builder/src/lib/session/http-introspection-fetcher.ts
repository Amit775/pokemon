import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { IntrospectionFetcher } from '../core/metadata/catalog';
import type { IntrospectionInputObject } from '../core/metadata/introspection-types';
import { hasuraDialect } from '../core/dialect/hasura-dialect';
import { readResources, type QueryRootField, type ResourceDescriptor } from '../core/metadata/read-resources';
import { QUERY_BUILDER_ENDPOINT } from '../overlay/query-builder-overlay';

const introspectTypeQuery = `query IntrospectType($typeName: String!) {
	__type(name: $typeName) {
		name
		kind
		inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
	}
}`;

const introspectQueryRootQuery = `query IntrospectQueryRoot {
	__type(name: "query_root") {
		fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } }
	}
}`;

interface IntrospectTypeResponse {
	readonly data?: { readonly __type: IntrospectionInputObject | null };
	readonly errors?: readonly { readonly message: string }[];
}

interface IntrospectQueryRootResponse {
	readonly data?: { readonly __type: { readonly fields: readonly QueryRootField[] } | null };
	readonly errors?: readonly { readonly message: string }[];
}

export function createHttpIntrospectionFetcher(): IntrospectionFetcher {
	const httpClient = inject(HttpClient);
	const endpoint = inject(QUERY_BUILDER_ENDPOINT);

	return async (typeName) => {
		const response = await firstValueFrom(
			httpClient.post<IntrospectTypeResponse>(endpoint, { query: introspectTypeQuery, variables: { typeName } }),
		);

		if (response.errors?.length) {
			throw new Error(response.errors.map((error) => error.message).join('; '));
		}

		return response.data?.__type ?? null;
	};
}

@Injectable({ providedIn: 'root' })
class DiscoveredResourcesCache {
	cachedResourcesPromise: Promise<readonly ResourceDescriptor[]> | null = null;
}

export function discoverResources(): Promise<readonly ResourceDescriptor[]> {
	const cache = inject(DiscoveredResourcesCache);
	if (cache.cachedResourcesPromise) return cache.cachedResourcesPromise;

	const httpClient = inject(HttpClient);
	const endpoint = inject(QUERY_BUILDER_ENDPOINT);

	const requestedPromise = firstValueFrom(
		httpClient.post<IntrospectQueryRootResponse>(endpoint, { query: introspectQueryRootQuery, variables: {} }),
	)
		.then((response) => {
			if (response.errors?.length) {
				throw new Error(response.errors.map((error) => error.message).join('; '));
			}

			const queryRootFields = response.data?.__type?.fields ?? [];
			return readResources(queryRootFields, hasuraDialect);
		})
		.catch((error) => {
			if (cache.cachedResourcesPromise === requestedPromise) {
				cache.cachedResourcesPromise = null;
			}
			throw error;
		});

	cache.cachedResourcesPromise = requestedPromise;
	return cache.cachedResourcesPromise;
}
