export interface IntrospectionTypeReference {
	readonly kind: string;
	readonly name: string | null;
	readonly ofType?: IntrospectionTypeReference | null;
}

export interface IntrospectionInputField {
	readonly name: string;
	readonly type: IntrospectionTypeReference;
}

export interface IntrospectionInputObject {
	readonly name: string;
	readonly kind: string;
	readonly inputFields: readonly IntrospectionInputField[];
}

export interface ScalarFieldDescriptor {
	readonly kind: 'scalar';
	readonly fieldName: string;
	readonly comparisonTypeName: string;
}

export interface RelationFieldDescriptor {
	readonly kind: 'relation';
	readonly fieldName: string;
	readonly booleanExpressionTypeName: string;
	readonly cardinality: 'toOne' | 'toMany';
}

export interface AggregatePredicateDescriptor {
	readonly kind: 'aggregatePredicate';
	readonly fieldName: string;
	readonly booleanExpressionTypeName: string;
}

export type CatalogFieldDescriptor = ScalarFieldDescriptor | RelationFieldDescriptor | AggregatePredicateDescriptor;

export interface IntrospectionOutputField {
	readonly name: string;
	readonly type: IntrospectionTypeReference;
}

export interface IntrospectionOutputObject {
	readonly name: string;
	readonly kind: string;
	readonly fields: readonly IntrospectionOutputField[];
}

export interface ScalarOutputFieldDescriptor {
	readonly kind: 'scalar';
	readonly fieldName: string;
	readonly scalarTypeName: string;
}

export interface RelationOutputFieldDescriptor {
	readonly kind: 'relation';
	readonly fieldName: string;
	readonly objectTypeName: string;
	readonly isList: boolean;
}

export type OutputFieldDescriptor = ScalarOutputFieldDescriptor | RelationOutputFieldDescriptor;
