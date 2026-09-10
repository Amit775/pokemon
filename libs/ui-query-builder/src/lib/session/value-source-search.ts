import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Kind, OperationTypeNode, print, type ArgumentNode, type VariableDefinitionNode } from 'graphql';
import { firstValueFrom } from 'rxjs';
import { literalValueNode, objectValueNode, variableValueNode } from '../core/compiler/value-nodes';
import { humanizeName } from '../metadata/humanize-name';
import { QUERY_BUILDER_ENDPOINT, type ValueSource } from '../metadata/query-builder-metadata';

export interface ValueOption {
	readonly value: string;
	readonly label: string;
}

interface ValueSourceSearchResponse {
	readonly data?: Readonly<Record<string, readonly Readonly<Record<string, string>>[]>>;
	readonly errors?: readonly { readonly message: string }[];
}

const searchLimit = 50;
const searchTextVariableName = 'searchText';

function nameNode(value: string) {
	return { kind: Kind.NAME, value } as const;
}

function buildSearchDocument(source: ValueSource, hasSearchText: boolean): string {
	const argumentNodes: ArgumentNode[] = [];
	const variableDefinitions: VariableDefinitionNode[] = [];

	if (hasSearchText) {
		const searchFieldName = source.searchFieldName ?? source.valueFieldName;
		argumentNodes.push({
			kind: Kind.ARGUMENT,
			name: nameNode('where'),
			value: objectValueNode([[searchFieldName, objectValueNode([['_ilike', variableValueNode(searchTextVariableName)]])]]),
		});
		variableDefinitions.push({
			kind: Kind.VARIABLE_DEFINITION,
			variable: { kind: Kind.VARIABLE, name: nameNode(searchTextVariableName) },
			type: { kind: Kind.NON_NULL_TYPE, type: { kind: Kind.NAMED_TYPE, name: nameNode('String') } },
		});
	}

	argumentNodes.push({ kind: Kind.ARGUMENT, name: nameNode('limit'), value: literalValueNode(searchLimit) });

	return print({
		kind: Kind.DOCUMENT,
		definitions: [
			{
				kind: Kind.OPERATION_DEFINITION,
				operation: OperationTypeNode.QUERY,
				name: nameNode('SearchValueSource'),
				...(variableDefinitions.length > 0 ? { variableDefinitions } : {}),
				selectionSet: {
					kind: Kind.SELECTION_SET,
					selections: [
						{
							kind: Kind.FIELD,
							name: nameNode(source.resourceName),
							arguments: argumentNodes,
							selectionSet: { kind: Kind.SELECTION_SET, selections: [{ kind: Kind.FIELD, name: nameNode(source.valueFieldName) }] },
						},
					],
				},
			},
		],
	});
}

function toValueOption(row: Readonly<Record<string, string>>, valueFieldName: string): ValueOption {
	const value = row[valueFieldName];
	return { value, label: humanizeName(value.replace(/-/g, '_')) };
}

export function createValueSourceSearch(): (source: ValueSource, searchText: string) => Promise<readonly ValueOption[]> {
	const httpClient = inject(HttpClient);
	const endpoint = inject(QUERY_BUILDER_ENDPOINT);

	return async (source, searchText) => {
		const hasSearchText = searchText.length > 0;
		const query = buildSearchDocument(source, hasSearchText);
		const variables = hasSearchText ? { [searchTextVariableName]: `%${searchText}%` } : {};

		const response = await firstValueFrom(httpClient.post<ValueSourceSearchResponse>(endpoint, { query, variables }));

		if (response.errors?.length) {
			throw new Error(response.errors.map((error) => error.message).join('; '));
		}

		const rows = response.data?.[source.resourceName] ?? [];
		return rows.map((row) => toValueOption(row, source.valueFieldName));
	};
}
