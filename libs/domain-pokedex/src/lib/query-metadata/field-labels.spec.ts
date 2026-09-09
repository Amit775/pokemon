import { hasuraIntrospectionFixture, schemaNamesFixture } from '@pokemon-center/ui-query-builder';
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

	it('never labels two distinct fields on the same parent type the same way', () => {
		const offenders: string[] = [];

		for (const [parentTypeName, parentType] of Object.entries(hasuraIntrospectionFixture)) {
			const fields = (parentType as { fields?: Array<{ name: string }> }).fields;

			if (!fields) {
				continue;
			}

			const labelToFieldName = new Map<string, string>();

			for (const field of fields) {
				if (field.name.endsWith('_aggregate')) {
					continue;
				}

				const label = pokedexFieldLabels[field.name];
				const previousFieldName = labelToFieldName.get(label);

				if (previousFieldName && previousFieldName !== field.name) {
					offenders.push(`${parentTypeName}.${previousFieldName}/${field.name} -> ${label}`);
				}

				labelToFieldName.set(label, field.name);
			}
		}

		expect(offenders).toEqual([]);
	});
});
