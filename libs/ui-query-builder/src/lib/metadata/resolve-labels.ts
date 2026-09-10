import { humanizeName } from './humanize-name';
import type { QueryBuilderMetadata } from './query-builder-metadata';

export function resolveResourceLabel(metadata: QueryBuilderMetadata, resourceName: string): string {
	const curated = metadata.resources.find((resource) => resource.resourceName === resourceName);
	if (curated) return curated.displayName;

	return metadata.resourceLabels[resourceName] ?? humanizeName(resourceName);
}

export function resolveFieldLabel(metadata: QueryBuilderMetadata, resourceName: string, fieldName: string): string {
	const curated = metadata.resources.find((resource) => resource.resourceName === resourceName);
	const override = curated?.fieldLabelOverrides?.[fieldName];
	if (override) return override;

	return metadata.fieldLabels[fieldName] ?? humanizeName(fieldName);
}
