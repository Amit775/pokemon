import type { QueryBuilderMetadata } from '@pokemon-center/ui-query-builder';
import { pokedexCuratedResources } from './curated-resources';
import { pokedexFieldLabels } from './field-labels';
import { pokedexResourceLabels } from './resource-labels';

export const pokedexQueryBuilderMetadata: QueryBuilderMetadata = {
	resources: pokedexCuratedResources,
	resourceLabels: pokedexResourceLabels,
	fieldLabels: pokedexFieldLabels,
};
