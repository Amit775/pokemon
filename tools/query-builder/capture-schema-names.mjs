import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getIntrospectionQuery, buildClientSchema } from 'graphql';

const endpoint = process.argv[2] ?? 'http://localhost:8080/v1/graphql';
const outputPath = process.argv[3];

const response = await fetch(endpoint, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ query: getIntrospectionQuery({ descriptions: false }) }),
});
const payload = await response.json();
if (payload.errors) throw new Error(JSON.stringify(payload.errors));

const schema = buildClientSchema(payload.data);
const queryFields = schema.getQueryType().getFields();

const resourceNames = Object.keys(queryFields)
	.filter((name) => queryFields[name].args.some((argument) => argument.name === 'where'))
	.filter((name) => !name.endsWith('_aggregate') && !name.endsWith('_by_pk'))
	.sort();

const fieldNames = new Set();
for (const resourceName of resourceNames) {
	let outputType = queryFields[resourceName].type;
	while (outputType.ofType) outputType = outputType.ofType;
	if (!outputType.getFields) continue;
	for (const fieldName of Object.keys(outputType.getFields())) {
		if (fieldName.endsWith('_aggregate')) continue;
		fieldNames.add(fieldName);
	}
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ resourceNames, fieldNames: [...fieldNames].sort() }, null, '\t')}\n`);
console.log(`resources: ${resourceNames.length}, distinct fields: ${fieldNames.size}`);
