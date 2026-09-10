import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { CatalogFieldDescriptor, IntrospectionInputObject, IntrospectionTypeReference } from './introspection-types';

export function unwrapTypeName(typeReference: IntrospectionTypeReference): string {
	let current: IntrospectionTypeReference = typeReference;
	while (current.ofType) {
		current = current.ofType;
	}
	return current.name ?? '';
}

export function readBooleanExpression(inputObject: IntrospectionInputObject, dialect: QueryBuilderDialect): readonly CatalogFieldDescriptor[] {
	const presentFieldNames = new Set(inputObject.inputFields.map((inputField) => inputField.name));
	const descriptors: CatalogFieldDescriptor[] = [];

	for (const inputField of inputObject.inputFields) {
		if (dialect.structuralFieldNames.has(inputField.name)) continue;

		const typeName = unwrapTypeName(inputField.type);

		if (dialect.isComparisonTypeName(typeName)) {
			descriptors.push({ kind: 'scalar', fieldName: inputField.name, comparisonTypeName: typeName });
			continue;
		}

		if (dialect.isAggregateBooleanExpressionTypeName(typeName)) {
			descriptors.push({ kind: 'aggregatePredicate', fieldName: inputField.name, booleanExpressionTypeName: typeName });
			continue;
		}

		if (dialect.isBooleanExpressionTypeName(typeName)) {
			const hasAggregateSibling = presentFieldNames.has(dialect.aggregateSiblingFieldName(inputField.name));
			descriptors.push({
				kind: 'relation',
				fieldName: inputField.name,
				booleanExpressionTypeName: typeName,
				cardinality: hasAggregateSibling ? 'toMany' : 'toOne',
			});
		}
	}

	return descriptors;
}
