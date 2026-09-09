import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { CatalogFieldDescriptor, IntrospectionInputObject, IntrospectionOutputObject, OutputFieldDescriptor } from './introspection-types';
import { readBooleanExpression } from './read-boolean-expression';
import { readOperators, type OperatorDescriptor } from './read-operators';
import { readOutputObject } from './read-output-object';

export type IntrospectionFetcher = (typeName: string) => Promise<IntrospectionInputObject | null>;
export type OutputIntrospectionFetcher = (typeName: string) => Promise<IntrospectionOutputObject | null>;

export interface QueryBuilderCatalog {
	readBooleanExpressionFields(typeName: string): Promise<readonly CatalogFieldDescriptor[]>;
	readOperatorsForComparisonType(typeName: string): Promise<readonly OperatorDescriptor[]>;
	readOutputObjectFields(typeName: string): Promise<readonly OutputFieldDescriptor[]>;
}

export function createQueryBuilderCatalog(
	fetcher: IntrospectionFetcher,
	dialect: QueryBuilderDialect,
	outputFetcher: OutputIntrospectionFetcher,
): QueryBuilderCatalog {
	const pendingByTypeName = new Map<string, Promise<IntrospectionInputObject | null>>();
	const pendingOutputByTypeName = new Map<string, Promise<IntrospectionOutputObject | null>>();

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

	function fetchOutputOnce(typeName: string): Promise<IntrospectionOutputObject | null> {
		const pending = pendingOutputByTypeName.get(typeName);
		if (pending) return pending;

		const requestedPromise: Promise<IntrospectionOutputObject | null> = outputFetcher(typeName).catch((error) => {
			if (pendingOutputByTypeName.get(typeName) === requestedPromise) {
				pendingOutputByTypeName.delete(typeName);
			}
			throw error;
		});

		pendingOutputByTypeName.set(typeName, requestedPromise);
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
		async readOutputObjectFields(typeName) {
			const outputObject = await fetchOutputOnce(typeName);
			return outputObject ? readOutputObject(outputObject) : [];
		},
	};
}
