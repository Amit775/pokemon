import type { IntrospectionInputObject, IntrospectionTypeReference } from './introspection-types';
import { unwrapTypeName } from './read-boolean-expression';

export interface OperatorDescriptor {
	readonly operatorName: string;
	readonly argumentTypeName: string;
	readonly acceptsList: boolean;
}

function containsList(typeReference: IntrospectionTypeReference): boolean {
	let current: IntrospectionTypeReference | null | undefined = typeReference;
	while (current) {
		if (current.kind === 'LIST') return true;
		current = current.ofType;
	}
	return false;
}

export function readOperators(inputObject: IntrospectionInputObject): readonly OperatorDescriptor[] {
	return inputObject.inputFields.map((inputField) => ({
		operatorName: inputField.name,
		argumentTypeName: unwrapTypeName(inputField.type),
		acceptsList: containsList(inputField.type),
	}));
}
