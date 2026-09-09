import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const endpoint = process.argv[2] ?? 'http://localhost:8080/v1/graphql';
const outputPath = process.argv[3];

const capturedTypeNames = [
	'pokemon_bool_exp',
	'pokemonstat_bool_exp',
	'pokemontype_bool_exp',
	'pokemonability_bool_exp',
	'pokemonmove_bool_exp',
	'type_bool_exp',
	'ability_bool_exp',
	'move_bool_exp',
	'stat_bool_exp',
	'pokemonmove_aggregate_bool_exp',
	'Int_comparison_exp',
	'String_comparison_exp',
	'Boolean_comparison_exp',
	'pokemon', 'pokemonstat', 'pokemontype', 'pokemonability', 'pokemonmove',
	'type', 'ability', 'move', 'stat', 'item', 'pokemonspecies', 'egggroup',
	'generation', 'region', 'location', 'nature', 'berry', 'machine', 'versiongroup',
	'growthrate', 'characteristic', 'encounter', 'contesttype', 'pokemonevolution',
	'egggroup_bool_exp', 'item_bool_exp', 'pokemonspecies_bool_exp', 'generation_bool_exp',
	'region_bool_exp', 'location_bool_exp', 'nature_bool_exp', 'berry_bool_exp',
	'machine_bool_exp', 'versiongroup_bool_exp', 'growthrate_bool_exp',
	'characteristic_bool_exp', 'encounter_bool_exp', 'contesttype_bool_exp',
	'pokemonevolution_bool_exp', 'pokemonegggroup_bool_exp',
];

async function fetchType(typeName) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: `query CaptureType($typeName: String!) {
				__type(name: $typeName) {
					name
					kind
					inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
					fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } }
				}
			}`,
			variables: { typeName },
		}),
	});
	const payload = await response.json();
	if (payload.errors) throw new Error(`${typeName}: ${JSON.stringify(payload.errors)}`);
	if (!payload.data.__type) throw new Error(`${typeName}: not found on ${endpoint}`);
	return payload.data.__type;
}

const fixture = {};
for (const typeName of capturedTypeNames) {
	const type = await fetchType(typeName);
	if (type.inputFields === null) delete type.inputFields;
	if (type.fields === null) delete type.fields;
	fixture[typeName] = type;
	const fieldCount = type.inputFields?.length ?? type.fields?.length ?? 0;
	const fieldKind = type.inputFields ? 'input fields' : 'fields';
	console.log(`captured ${typeName} (${fieldCount} ${fieldKind})`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(fixture, null, '\t')}\n`);
console.log(`wrote ${outputPath}`);
