import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { CatalogFieldDescriptor, IntrospectionInputObject } from './introspection-types';
import { readBooleanExpression } from './read-boolean-expression';
import { readOperators, type OperatorDescriptor } from './read-operators';

export type IntrospectionFetcher = (typeName: string) => Promise<IntrospectionInputObject | null>;

export interface QueryBuilderCatalog {
	readBooleanExpressionFields(typeName: string): Promise<readonly CatalogFieldDescriptor[]>;
	readOperatorsForComparisonType(typeName: string): Promise<readonly OperatorDescriptor[]>;
}

export function createQueryBuilderCatalog(fetcher: IntrospectionFetcher, dialect: QueryBuilderDialect): QueryBuilderCatalog {
	const pendingByTypeName = new Map<string, Promise<IntrospectionInputObject | null>>();

	function fetchOnce(typeName: string): Promise<IntrospectionInputObject | null> {
		const pending = pendingByTypeName.get(typeName);
		if (pending) return pending;

		const requestedPromise: Promise<IntrospectionInputObject | null> = fetcher(typeName).catch((error) => {
			if (pendingByTypeName.get(typeName) === requestedPromise) {
				pendingByTypeName.delete(typeName);
			}
			throw error;
		});

		pendingByTypeName.set(typeName, requestedPromise);
		return requestedPromise;
	}

	return {
		async readBooleanExpressionFields(typeName) {
			const inputObject = await fetchOnce(typeName);
			return inputObject ? readBooleanExpression(inputObject, dialect) : [];
		},
		async readOperatorsForComparisonType(typeName) {
			const inputObject = await fetchOnce(typeName);
			return inputObject ? readOperators(inputObject) : [];
		},
	};
}
