import type { AggregateFunctionName } from '../model/query-tree';
import type { QueryBuilderDialect } from './query-builder-dialect';

const comparisonTypeSuffix = '_comparison_exp';
const booleanExpressionSuffix = '_bool_exp';
const aggregateBooleanExpressionSuffix = '_aggregate_bool_exp';

export const hasuraDialect: QueryBuilderDialect = {
	structuralFieldNames: new Set(['_and', '_or', '_not']),
	combinatorFieldNames: { and: '_and', or: '_or' },
	negationFieldName: '_not',
	isComparisonTypeName(typeName) {
		return typeName.endsWith(comparisonTypeSuffix);
	},
	isBooleanExpressionTypeName(typeName) {
		return typeName.endsWith(booleanExpressionSuffix);
	},
	isAggregateBooleanExpressionTypeName(typeName) {
		return typeName.endsWith(aggregateBooleanExpressionSuffix);
	},
	aggregateSiblingFieldName(fieldName) {
		return `${fieldName}_aggregate`;
	},
	aggregateFieldsTypeName(resourceName, functionName: AggregateFunctionName) {
		return `${resourceName}_${functionName}_fields`;
	},
};
