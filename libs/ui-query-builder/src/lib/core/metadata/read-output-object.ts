import type { IntrospectionOutputObject, IntrospectionTypeReference, OutputFieldDescriptor } from './introspection-types';
import { unwrapTypeName } from './read-boolean-expression';

const objectKinds = new Set(['OBJECT', 'INTERFACE', 'UNION']);

function unwrapKindAndList(typeReference: IntrospectionTypeReference): { kind: string; isList: boolean } {
	let current: IntrospectionTypeReference | null | undefined = typeReference;
	let isList = false;
	let kind = '';
	while (current) {
		if (current.kind === 'LIST') isList = true;
		if (current.kind !== 'LIST' && current.kind !== 'NON_NULL') kind = current.kind;
		current = current.ofType;
	}
	return { kind, isList };
}

export function readOutputObject(outputObject: IntrospectionOutputObject): readonly OutputFieldDescriptor[] {
	const descriptors: OutputFieldDescriptor[] = [];

	for (const field of outputObject.fields) {
		if (field.name.endsWith('_aggregate')) continue;

		const typeName = unwrapTypeName(field.type);
		const { kind, isList } = unwrapKindAndList(field.type);

		if (objectKinds.has(kind)) {
			descriptors.push({ kind: 'relation', fieldName: field.name, objectTypeName: typeName, isList });
		} else {
			descriptors.push({ kind: 'scalar', fieldName: field.name, scalarTypeName: typeName });
		}
	}

	return descriptors;
}
