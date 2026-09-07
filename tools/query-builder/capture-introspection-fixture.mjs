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
	fixture[typeName] = await fetchType(typeName);
	console.log(`captured ${typeName} (${fixture[typeName].inputFields.length} input fields)`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(fixture, null, '\t')}\n`);
console.log(`wrote ${outputPath}`);
