import { humanizeName } from './humanize-name';

describe('humanizeName', () => {
	it('splits snake_case and title-cases each word', () => {
		expect(humanizeName('base_stat')).toBe('Base Stat');
		expect(humanizeName('pokemon_species_id')).toBe('Pokemon Species Id');
	});

	it('title-cases a single word', () => {
		expect(humanizeName('name')).toBe('Name');
	});

	it('leaves a run-together name as one capitalised word, because guessing is worse than being plain', () => {
		expect(humanizeName('pokemonspeciesdescription')).toBe('Pokemonspeciesdescription');
	});

	it('returns an empty string unchanged', () => {
		expect(humanizeName('')).toBe('');
	});
});
