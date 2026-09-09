import { schemaNamesFixture } from '@pokemon-center/ui-query-builder';
import { pokedexFieldLabels } from './field-labels';

describe('pokedexFieldLabels', () => {
	it('covers every distinct field name in the schema', () => {
		const missing = schemaNamesFixture.fieldNames.filter((fieldName) => !pokedexFieldLabels[fieldName]);

		expect(missing).toEqual([]);
	});

	it('has no entry for a field that no longer exists', () => {
		const known = new Set(schemaNamesFixture.fieldNames);
		const stale = Object.keys(pokedexFieldLabels).filter((fieldName) => !known.has(fieldName));

		expect(stale).toEqual([]);
	});

	it('never emits a raw identifier as a label', () => {
		const rawLooking = Object.entries(pokedexFieldLabels)
			.filter(([, label]) => label.includes('_') || label === label.toLowerCase())
			.map(([fieldName]) => fieldName);

		expect(rawLooking).toEqual([]);
	});
});
