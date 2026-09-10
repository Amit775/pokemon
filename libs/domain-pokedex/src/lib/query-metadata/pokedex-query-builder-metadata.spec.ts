import { hasuraDialect, hasuraIntrospectionFixture, readBooleanExpression, type IntrospectionInputObject } from '@pokemon-center/ui-query-builder';
import { pokedexQueryBuilderMetadata } from './pokedex-query-builder-metadata';

const typedFixture = hasuraIntrospectionFixture as unknown as Record<string, IntrospectionInputObject>;

function resolvePath(rootTypeName: string, fieldPath: readonly string[]): string | null {
	let currentTypeName = rootTypeName;

	for (const [index, segment] of fieldPath.entries()) {
		const inputObject = typedFixture[currentTypeName];
		if (!inputObject) return `type ${currentTypeName} is not in the fixture`;

		const descriptor = readBooleanExpression(inputObject, hasuraDialect).find((field) => field.fieldName === segment);
		if (!descriptor) return `${currentTypeName} has no field ${segment}`;

		const isLast = index === fieldPath.length - 1;
		if (isLast) return descriptor.kind === 'scalar' ? null : `${segment} is not a scalar leaf`;
		if (descriptor.kind !== 'relation') return `${segment} is not a relation`;

		currentTypeName = descriptor.booleanExpressionTypeName;
	}

	return 'empty field path';
}

describe('curated query builder metadata', () => {
	it('every curated resource has a boolean expression type in the fixture', () => {
		const missing = pokedexQueryBuilderMetadata.resources
			.filter((resource) => !typedFixture[`${resource.resourceName}_bool_exp`])
			.map((resource) => resource.resourceName);

		expect(missing).toEqual([]);
	});

	it('every shortcut resolves to a scalar leaf', () => {
		const failures: string[] = [];

		for (const resource of pokedexQueryBuilderMetadata.resources) {
			for (const shortcut of resource.shortcuts) {
				const fullPath = shortcut.scope ? [...shortcut.scope.relationPath, ...shortcut.fieldPath] : shortcut.fieldPath;
				const problem = resolvePath(`${resource.resourceName}_bool_exp`, fullPath);
				if (problem) failures.push(`${resource.resourceName}.${shortcut.shortcutId}: ${problem}`);
			}
		}

		expect(failures).toEqual([]);
	});

	it('every pinned rule inside a scope resolves too', () => {
		const failures: string[] = [];

		for (const resource of pokedexQueryBuilderMetadata.resources) {
			for (const shortcut of resource.shortcuts) {
				for (const pinned of shortcut.scope?.pinnedRules ?? []) {
					const fullPath = [...(shortcut.scope?.relationPath ?? []), ...pinned.fieldPath];
					const problem = resolvePath(`${resource.resourceName}_bool_exp`, fullPath);
					if (problem) failures.push(`${resource.resourceName}.${shortcut.shortcutId} pinned: ${problem}`);
				}
			}
		}

		expect(failures).toEqual([]);
	});

	it('every value source names a resource that exists', () => {
		const failures: string[] = [];

		for (const resource of pokedexQueryBuilderMetadata.resources) {
			for (const shortcut of resource.shortcuts) {
				const source = shortcut.valueSource;
				if (source && !typedFixture[`${source.resourceName}_bool_exp`]) {
					failures.push(`${resource.resourceName}.${shortcut.shortcutId} -> ${source.resourceName}`);
				}
			}
		}

		expect(failures).toEqual([]);
	});

	it('assembles the label tables', () => {
		expect(Object.keys(pokedexQueryBuilderMetadata.resourceLabels).length).toBeGreaterThan(150);
		expect(Object.keys(pokedexQueryBuilderMetadata.fieldLabels).length).toBeGreaterThan(350);
	});
});
