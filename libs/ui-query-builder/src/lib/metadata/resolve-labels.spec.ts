import { resolveFieldLabel, resolveResourceLabel } from './resolve-labels';
import type { QueryBuilderMetadata } from './query-builder-metadata';

const metadata: QueryBuilderMetadata = {
	resources: [
		{ resourceName: 'pokemon', displayName: 'Pokémon', group: 'Core', priority: 100, shortcuts: [], fieldLabelOverrides: { name: 'Pokémon Name' } },
	],
	resourceLabels: { pokemon: 'Pokemon Table', pokemonspecy: 'Species' },
	fieldLabels: { name: 'Name', base_stat: 'Base Stat' },
};

describe('resolveResourceLabel', () => {
	it('prefers a curated resource display name over the label table', () => {
		expect(resolveResourceLabel(metadata, 'pokemon')).toBe('Pokémon');
	});

	it('falls back to the label table for an uncurated resource', () => {
		expect(resolveResourceLabel(metadata, 'pokemonspecy')).toBe('Species');
	});

	it('humanizes a resource the tables do not know', () => {
		expect(resolveResourceLabel(metadata, 'mystery_table')).toBe('Mystery Table');
	});
});

describe('resolveFieldLabel', () => {
	it('prefers a per-resource override', () => {
		expect(resolveFieldLabel(metadata, 'pokemon', 'name')).toBe('Pokémon Name');
	});

	it('falls back to the global field table', () => {
		expect(resolveFieldLabel(metadata, 'move', 'name')).toBe('Name');
		expect(resolveFieldLabel(metadata, 'pokemon', 'base_stat')).toBe('Base Stat');
	});

	it('humanizes a field the tables do not know', () => {
		expect(resolveFieldLabel(metadata, 'pokemon', 'some_new_column')).toBe('Some New Column');
	});
});
