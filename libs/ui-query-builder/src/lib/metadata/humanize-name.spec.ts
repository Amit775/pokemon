import { humanizeName, humanizeValue } from './humanize-name';

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

describe('humanizeValue', () => {
	it('treats a hyphen as a word break, so a slug value does not render half-humanized', () => {
		expect(humanizeValue('special-attack')).toBe('Special Attack');
		expect(humanizeValue('special-defense')).toBe('Special Defense');
		expect(humanizeValue('razor-leaf')).toBe('Razor Leaf');
	});

	it('handles a value that mixes hyphens and underscores', () => {
		expect(humanizeValue('great-ball_item')).toBe('Great Ball Item');
	});

	it('leaves a plain value exactly as humanizeName would', () => {
		expect(humanizeValue('speed')).toBe('Speed');
		expect(humanizeValue('')).toBe('');
	});
});
