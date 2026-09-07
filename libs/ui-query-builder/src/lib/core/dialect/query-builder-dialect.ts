import type { AggregateFunctionName } from '../model/query-tree';

export interface QueryBuilderDialect {
	readonly structuralFieldNames: ReadonlySet<string>;
	readonly combinatorFieldNames: Readonly<Record<'and' | 'or', string>>;
	readonly negationFieldName: string;
	isComparisonTypeName(typeName: string): boolean;
	isBooleanExpressionTypeName(typeName: string): boolean;
	isAggregateBooleanExpressionTypeName(typeName: string): boolean;
	aggregateSiblingFieldName(fieldName: string): string;
	aggregateFieldsTypeName(resourceName: string, functionName: AggregateFunctionName): string;
}
