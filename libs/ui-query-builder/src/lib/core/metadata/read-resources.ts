import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { IntrospectionTypeReference } from './introspection-types';
import { unwrapTypeName } from './read-boolean-expression';

export interface QueryRootArgument {
	readonly name: string;
	readonly type: IntrospectionTypeReference;
}

export interface QueryRootField {
	readonly name: string;
	readonly args: readonly QueryRootArgument[];
}

export interface ResourceDescriptor {
	readonly resourceName: string;
	readonly booleanExpressionTypeName: string;
}

export function readResources(queryRootFields: readonly QueryRootField[], dialect: QueryBuilderDialect): readonly ResourceDescriptor[] {
	const descriptors: ResourceDescriptor[] = [];

	for (const field of queryRootFields) {
		if (field.name.endsWith('_aggregate') || field.name.endsWith('_by_pk')) continue;

		const whereArgument = field.args.find((argument) => argument.name === 'where');
		if (!whereArgument) continue;

		const booleanExpressionTypeName = unwrapTypeName(whereArgument.type);
		if (!dialect.isBooleanExpressionTypeName(booleanExpressionTypeName)) continue;

		descriptors.push({ resourceName: field.name, booleanExpressionTypeName });
	}

	return descriptors;
}
