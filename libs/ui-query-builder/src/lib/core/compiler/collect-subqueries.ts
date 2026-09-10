import { isFilterGroup, type FilterGroup, type QueryBuilderNode, type ScalarSubquery } from '../model/query-tree';

export interface CollectedSubquery {
	readonly variableName: string;
	readonly nodeIds: readonly string[];
	readonly subquery: ScalarSubquery;
}

function toPascalCase(value: string): string {
	return value
		.split(/[^a-zA-Z0-9]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function selectorSuffix(subquery: ScalarSubquery): string {
	if (subquery.selector.kind === 'aggregate') {
		return `${toPascalCase(subquery.selector.functionName)}${subquery.selector.fieldPath.map(toPascalCase).join('')}`;
	}
	return subquery.selector.fieldPath.map(toPascalCase).join('');
}

function identityOf(subquery: ScalarSubquery): string {
	return JSON.stringify(subquery, (key, value) => (key === 'nodeId' ? undefined : value));
}

export function collectSubqueries(group: FilterGroup): readonly CollectedSubquery[] {
	const byIdentity = new Map<string, { variableName: string; nodeIds: string[]; subquery: ScalarSubquery }>();

	function visit(node: QueryBuilderNode): void {
		if (isFilterGroup(node)) {
			node.children.forEach(visit);
			return;
		}
		if (node.operand.source !== 'subquery') return;

		const subquery = node.operand.subquery;
		const identity = identityOf(subquery);
		const existing = byIdentity.get(identity);

		if (existing) {
			existing.nodeIds.push(node.nodeId);
			return;
		}

		const variableName = `${subquery.resourceName}${selectorSuffix(subquery)}${byIdentity.size + 1}`;
		byIdentity.set(identity, { variableName, nodeIds: [node.nodeId], subquery });
	}

	visit(group);

	return [...byIdentity.values()];
}
