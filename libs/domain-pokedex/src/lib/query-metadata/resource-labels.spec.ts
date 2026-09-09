import { schemaNamesFixture } from '@pokemon-center/ui-query-builder';
import { pokedexResourceLabels } from './resource-labels';

describe('pokedexResourceLabels', () => {
	it('covers every resource in the schema', () => {
		const missing = schemaNamesFixture.resourceNames.filter((resourceName) => !pokedexResourceLabels[resourceName]);

		expect(missing).toEqual([]);
	});

	it('has no entry for a resource that no longer exists', () => {
		const known = new Set(schemaNamesFixture.resourceNames);
		const stale = Object.keys(pokedexResourceLabels).filter((resourceName) => !known.has(resourceName));

		expect(stale).toEqual([]);
	});

	it('never emits a raw identifier as a label', () => {
		const rawLooking = Object.entries(pokedexResourceLabels)
			.filter(([, label]) => label.includes('_') || label === label.toLowerCase())
			.map(([resourceName]) => resourceName);

		expect(rawLooking).toEqual([]);
	});
});
