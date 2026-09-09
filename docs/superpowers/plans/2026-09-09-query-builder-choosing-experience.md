# Query Builder — Choosing Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every resource, path, field and non-primitive value in the query builder a searchable list of real human names instead of a chip list or a raw text box.

**Architecture:** A curated metadata layer supplies display names, grouping, priority, join-hiding shortcuts and value sources. `libs/ui-query-builder` stays generic and gains only the metadata *types*, label resolution and shortcut expansion; the Pokémon-specific data lives in `libs/domain-pokedex`. A single presentational `pokedex-search-select` in `libs/ui-pokedex` serves every picker. Shortcuts expand into filter-tree nodes the compiler already understands, so no compiler change is needed.

**Tech Stack:** Angular 22 (standalone, OnPush, signal inputs, `@angular/forms/signals`), `@ngrx/signals` 21, `graphql` 16, Angular CDK 22 (`CdkListbox`, `CdkConnectedOverlay`, `CdkTrapFocus`), Nx 23, Jest 30, `@ngneat/spectator`.

**Spec:** `docs/superpowers/specs/2026-09-09-query-builder-choosing-experience-design.md` — read it before starting. It carries the measurements the plan argues from.

## Global Constraints

- **Naming — no abbreviations. This is the first rule.** Spell every identifier out: `context` never `ctx`, `pokedex` never `dex`, `operatorName` never `op`, `accumulated` never `acc`. Game-native terms (HP, PP, SP, STAB, IV, EV) are the domain's own vocabulary and stay as they are. From `AGENTS.md`.
- **No comments.** No line comments, no block comments, no JSDoc. Name things instead. Machine-read directives (`// eslint-disable-next-line`, `// @ts-expect-error`, `@jest-environment` docblocks) are exempt.
- **Formatting:** tabs for indentation, single quotes, semicolons, trailing commas.
- **Angular:** standalone components, `ChangeDetectionStrategy.OnPush`, `input()`/`output()`/`computed()`, `inject()` over constructor injection. Selector prefix `pokedex`. One directory per component, `<name>/<name>.component.ts`.
- **Styling:** `libs/ui-pokedex` design tokens only (`var(--surface)`, `var(--ink-muted)`, `var(--line)`, `var(--r-pill)`, `var(--s-1)`, `var(--fs-sm)`…). No parallel palette, no hardcoded colours.
- **Do NOT use `@angular/material`.** It is a dependency of this workspace but referenced in **zero** files. Everything is built on Angular CDK.
- **`libs/ui-query-builder` never imports AG Grid, never names an endpoint, and learns nothing about Pokémon.** Pokémon data lives in `libs/domain-pokedex`.
- **Verification is four commands, not two.** This library once went ten tasks without compiling because Jest's transform does not enforce type diagnostics and `nx lint` runs ESLint. Every task runs both `tsc` configs.
- **Branch:** `feat/query-builder-choosing-experience`, already checked out. Never commit to `main`. Conventional commits ending with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Endpoint for networked tasks:** `http://localhost:8080/v1/graphql` (local Hasura PokeAPI, unauthenticated). Tests never open a socket — they use committed fixtures and stub fetchers.
- **The Bash tool hangs in this environment. Use PowerShell.** Never background a long command and stop; run in the foreground with a generous timeout. `pnpm nx test ui-query-builder` takes ~3 minutes. The Jest 30 path filter is `--testPathPatterns` (plural; the singular form silently does nothing).

## Verified Facts

Measured against the live endpoint during design. Trust these over recall.

| Fact | Value |
|---|---|
| Leading resources | 160 |
| Resource `description` values that are useful | **0** (all Hasura boilerplate) |
| Total field slots across all resources | 1,279 |
| **Distinct** field names (174 scalar + 211 relation) | **385** |
| Total label entries to author | **545** |
| `pokemon` output type | 39 fields (8 scalar, 16 relation) |
| Value source row counts | `stat` 9 · `generation` 9 · `egggroup` 15 · `type` 21 · `ability` 374 · `move` 937 · `pokemon` 1,351 · `item` 2,223 |

Hasura foreign-key disambiguation produces names no algorithm decodes — these are why labels are authored data:

```
PokemonspecyByPartySpeciesId → Party Species
BerryflavorByLikesFlavorId   → Liked Flavor
TypeByTargetTypeId           → Target Type
ContestcombosBySecondMoveId  → Second Move
LanguageByLocalLanguageId    → Language
```

## Existing Interfaces You Will Build On

These exist and are validated. Do not redesign them.

```ts
// core/metadata/catalog.ts
type IntrospectionFetcher = (typeName: string) => Promise<IntrospectionInputObject | null>;
interface QueryBuilderCatalog {
	readBooleanExpressionFields(typeName: string): Promise<readonly CatalogFieldDescriptor[]>;
	readOperatorsForComparisonType(typeName: string): Promise<readonly OperatorDescriptor[]>;
}
function createQueryBuilderCatalog(fetcher: IntrospectionFetcher, dialect: QueryBuilderDialect): QueryBuilderCatalog;

// core/model/query-tree.ts
type QueryBuilderNode = FilterGroup | FilterRule;
function createFilterGroup(overrides?): FilterGroup;   // kind, nodeId, combinator, negated, relationScope, children
function createFilterRule(overrides?): FilterRule;     // kind, nodeId, fieldPath, operatorName, operand

// session/query-builder.store.ts — QueryBuilderStore methods
selectResource(resourceName) · addRule(parentGroupNodeId) · addGroup(parentGroupNodeId)
updateRule(ruleNodeId, changes) · removeNode(nodeId) · setCombinator(groupNodeId, combinator)
toggleNegated(groupNodeId) · setRelationScope(groupNodeId, relationScope | null)
setResolvedValue(variableName, value, variableTypeName) · setComparisonTypeName(ruleNodeId, comparisonTypeName)
setSelection(selection) · setLimit(limit)

// component selectors and surfaces
pokedex-query-builder      [resources] [catalog] (compiled)
pokedex-filter-group       [group] [catalog] [rootTypeName] (combinatorChanged) (negatedChanged) (groupPatched) (addRuleRequested) (addGroupRequested) (removeNodeRequested) (ruleChanged)
pokedex-filter-rule        [catalog] [rule] [comparisonTypeName] [rootTypeName] (ruleChange)
pokedex-operand-editor     [operand] [resolvedValue] [argumentTypeName] [acceptsList] (operandChange)
pokedex-field-path-picker  [catalog] [rootTypeName] [path] (pathChosen)
pokedex-selection-editor   [resourceName] [selection] (selectionChanged)
```

## File Structure

```
libs/ui-query-builder/src/lib/
  core/metadata/introspection-types.ts        MODIFY  add output-object shapes
  core/metadata/read-output-object.ts         CREATE  output type -> field descriptors
  core/metadata/catalog.ts                    MODIFY  add readOutputObjectFields
  core/metadata/__fixtures__/                 MODIFY  expanded fixture + names manifest
  metadata/query-builder-metadata.ts          CREATE  metadata types + token (replaces overlay/)
  metadata/humanize-name.ts                   CREATE  dumb title-case fallback
  metadata/resolve-labels.ts                  CREATE  override -> table -> fallback
  metadata/expand-shortcut.ts                 CREATE  shortcut -> filter-tree node
  session/http-introspection-fetcher.ts       MODIFY  add output-type fetch
  session/value-source-search.ts              CREATE  value option lookup over http
  components/**                               MODIFY  six sites rewired
libs/ui-pokedex/src/lib/
  search-select/search-select.component.ts    CREATE  the one picker primitive
libs/domain-pokedex/src/lib/
  query-metadata/resource-labels.ts           CREATE  160 entries
  query-metadata/field-labels.ts              CREATE  385 entries
  query-metadata/curated-resources.ts         CREATE  ~20 ResourceMetadata with shortcuts
  query-metadata/pokedex-query-builder-metadata.ts        CREATE  assembles the three
  query-metadata/pokedex-query-builder-metadata.spec.ts   CREATE  drift + coverage test
  features/query-explorer/                    MODIFY  provide metadata, pass to builder
tools/query-builder/
  capture-introspection-fixture.mjs           MODIFY  expanded type list
  capture-schema-names.mjs                    CREATE  names manifest for coverage test
```

---

### Task 1: Capture the expanded fixture and the schema-names manifest

**Files:**
- Modify: `tools/query-builder/capture-introspection-fixture.mjs`
- Create: `tools/query-builder/capture-schema-names.mjs`
- Modify: `libs/ui-query-builder/src/lib/core/metadata/__fixtures__/hasura-introspection.fixture.json`
- Create: `libs/ui-query-builder/src/lib/core/metadata/__fixtures__/schema-names.fixture.json`

**Interfaces:**
- Consumes: nothing
- Produces: two committed fixtures. The introspection fixture gains **output object types** (key shape unchanged: `{ "<typeName>": { name, kind, inputFields?, fields? } }`). The names manifest is `{ "resourceNames": string[], "fieldNames": string[] }`.

Requires Hasura running. This and Task 12's live check are the only networked tasks.

- [ ] **Step 1: Extend the capture script's type list**

Add the output object types for the curated resources alongside the existing `_bool_exp` entries, and capture `fields` as well as `inputFields`. The script currently requests only `inputFields`; output object types have `fields` instead, so the query needs both and the writer must keep whichever is present.

Add these type names to `capturedTypeNames`:

```js
'pokemon', 'pokemonstat', 'pokemontype', 'pokemonability', 'pokemonmove',
'type', 'ability', 'move', 'stat', 'item', 'pokemonspecies', 'egggroup',
'generation', 'region', 'location', 'nature', 'berry', 'machine', 'versiongroup',
'growthrate', 'characteristic', 'encounter', 'contesttype', 'pokemonevolution',
'egggroup_bool_exp', 'item_bool_exp', 'pokemonspecies_bool_exp', 'generation_bool_exp',
'region_bool_exp', 'location_bool_exp', 'nature_bool_exp', 'berry_bool_exp',
'machine_bool_exp', 'versiongroup_bool_exp', 'growthrate_bool_exp',
'characteristic_bool_exp', 'encounter_bool_exp', 'contesttype_bool_exp',
'pokemonevolution_bool_exp', 'pokemonegggroup_bool_exp',
'Float_comparison_exp', 'numeric_comparison_exp',
```

Change the GraphQL query to request both shapes:

```js
query CaptureType($typeName: String!) {
	__type(name: $typeName) {
		name
		kind
		inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
		fields { name type { kind name ofType { kind name ofType { kind name } } } }
	}
}
```

Some of the listed types may not exist under those exact names. The script already throws on a missing type — **keep that behaviour**, and if one throws, remove it from the list and note it in your report rather than silencing the error.

- [ ] **Step 2: Write the names-manifest script**

```js
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
```

- [ ] **Step 3: Run both scripts**

```bash
node tools/query-builder/capture-introspection-fixture.mjs http://localhost:8080/v1/graphql libs/ui-query-builder/src/lib/core/metadata/__fixtures__/hasura-introspection.fixture.json
node tools/query-builder/capture-schema-names.mjs http://localhost:8080/v1/graphql libs/ui-query-builder/src/lib/core/metadata/__fixtures__/schema-names.fixture.json
```

Expected from the second: `resources: 160, distinct fields: 385`. **If either number differs, STOP and report BLOCKED with the actual numbers** — the label tables and their coverage test are sized against them.

- [ ] **Step 4: Confirm the existing suite still passes**

Run: `pnpm nx test ui-query-builder`
Expected: 101 passed + 2 skipped. The fixture grew but existing tests read the same keys.

- [ ] **Step 5: Commit**

```bash
git add tools/query-builder libs/ui-query-builder/src/lib/core/metadata/__fixtures__
git commit -m "chore(query-builder): capture output types and a schema-names manifest"
```

---

### Task 2: Read output object types

**Files:**
- Modify: `libs/ui-query-builder/src/lib/core/metadata/introspection-types.ts`
- Create: `libs/ui-query-builder/src/lib/core/metadata/read-output-object.ts`
- Create: `libs/ui-query-builder/src/lib/core/metadata/read-output-object.spec.ts`
- Modify: `libs/ui-query-builder/src/lib/core/metadata/catalog.ts`
- Modify: `libs/ui-query-builder/src/lib/core/metadata/catalog.spec.ts`
- Modify: `libs/ui-query-builder/src/lib/session/http-introspection-fetcher.ts`
- Modify: `libs/ui-query-builder/src/lib/session/http-introspection-fetcher.spec.ts`
- Modify: `libs/ui-query-builder/src/index.ts`

**Interfaces:**
- Consumes: Task 1's fixture; existing `IntrospectionTypeReference`, `unwrapTypeName`
- Produces:

```ts
interface IntrospectionOutputField { readonly name: string; readonly type: IntrospectionTypeReference }
interface IntrospectionOutputObject { readonly name: string; readonly kind: string; readonly fields: readonly IntrospectionOutputField[] }
type OutputFieldDescriptor =
	| { readonly kind: 'scalar'; readonly fieldName: string; readonly scalarTypeName: string }
	| { readonly kind: 'relation'; readonly fieldName: string; readonly objectTypeName: string; readonly isList: boolean };
function readOutputObject(outputObject: IntrospectionOutputObject): readonly OutputFieldDescriptor[];
type OutputIntrospectionFetcher = (typeName: string) => Promise<IntrospectionOutputObject | null>;
// catalog gains:
readOutputObjectFields(typeName: string): Promise<readonly OutputFieldDescriptor[]>;
// signature becomes:
function createQueryBuilderCatalog(fetcher: IntrospectionFetcher, dialect: QueryBuilderDialect, outputFetcher: OutputIntrospectionFetcher): QueryBuilderCatalog;
function createHttpOutputIntrospectionFetcher(): OutputIntrospectionFetcher;
```

This closes a gap disclosed on the previous design: the selection editor's field names were unvalidated free text because nothing read output types.

- [ ] **Step 1: Write the failing reader test**

```ts
import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { readOutputObject } from './read-output-object';
import type { IntrospectionOutputObject } from './introspection-types';

const pokemonOutputObject = fixture['pokemon'] as unknown as IntrospectionOutputObject;

describe('readOutputObject', () => {
	const descriptors = readOutputObject(pokemonOutputObject);
	const byName = new Map(descriptors.map((descriptor) => [descriptor.fieldName, descriptor]));

	it('classifies a scalar column with its scalar type', () => {
		expect(byName.get('base_experience')).toEqual({ kind: 'scalar', fieldName: 'base_experience', scalarTypeName: 'Int' });
		expect(byName.get('name')).toEqual({ kind: 'scalar', fieldName: 'name', scalarTypeName: 'String' });
	});

	it('classifies a to-many relation as a list', () => {
		expect(byName.get('pokemonstats')).toEqual({ kind: 'relation', fieldName: 'pokemonstats', objectTypeName: 'pokemonstat', isList: true });
	});

	it('classifies a to-one relation as not a list', () => {
		expect(byName.get('pokemonspecy')).toEqual({ kind: 'relation', fieldName: 'pokemonspecy', objectTypeName: 'pokemonspecies', isList: false });
	});

	it('drops the aggregate companions, which are not selectable fields', () => {
		expect([...byName.keys()].some((fieldName) => fieldName.endsWith('_aggregate'))).toBe(false);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm nx test ui-query-builder --testPathPatterns=read-output-object`
Expected: FAIL — cannot resolve `./read-output-object`.

- [ ] **Step 3: Add the output shapes to `introspection-types.ts`**

```ts
export interface IntrospectionOutputField {
	readonly name: string;
	readonly type: IntrospectionTypeReference;
}

export interface IntrospectionOutputObject {
	readonly name: string;
	readonly kind: string;
	readonly fields: readonly IntrospectionOutputField[];
}

export interface ScalarOutputFieldDescriptor {
	readonly kind: 'scalar';
	readonly fieldName: string;
	readonly scalarTypeName: string;
}

export interface RelationOutputFieldDescriptor {
	readonly kind: 'relation';
	readonly fieldName: string;
	readonly objectTypeName: string;
	readonly isList: boolean;
}

export type OutputFieldDescriptor = ScalarOutputFieldDescriptor | RelationOutputFieldDescriptor;
```

- [ ] **Step 4: Write `read-output-object.ts`**

```ts
import type { IntrospectionOutputObject, IntrospectionTypeReference, OutputFieldDescriptor } from './introspection-types';
import { unwrapTypeName } from './read-boolean-expression';

const objectKinds = new Set(['OBJECT', 'INTERFACE', 'UNION']);

function unwrapKindAndList(typeReference: IntrospectionTypeReference): { kind: string; isList: boolean } {
	let current: IntrospectionTypeReference | null | undefined = typeReference;
	let isList = false;
	let kind = '';
	while (current) {
		if (current.kind === 'LIST') isList = true;
		if (current.kind !== 'LIST' && current.kind !== 'NON_NULL') kind = current.kind;
		current = current.ofType;
	}
	return { kind, isList };
}

export function readOutputObject(outputObject: IntrospectionOutputObject): readonly OutputFieldDescriptor[] {
	const descriptors: OutputFieldDescriptor[] = [];

	for (const field of outputObject.fields) {
		if (field.name.endsWith('_aggregate')) continue;

		const typeName = unwrapTypeName(field.type);
		const { kind, isList } = unwrapKindAndList(field.type);

		if (objectKinds.has(kind)) {
			descriptors.push({ kind: 'relation', fieldName: field.name, objectTypeName: typeName, isList });
		} else {
			descriptors.push({ kind: 'scalar', fieldName: field.name, scalarTypeName: typeName });
		}
	}

	return descriptors;
}
```

- [ ] **Step 5: Run the reader test**

Run: `pnpm nx test ui-query-builder --testPathPatterns=read-output-object`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing catalog test**

Add to `catalog.spec.ts`. The stub fetcher pattern already in that file is what to follow; add a second stub for output types.

```ts
it('reads output object fields for a type', async () => {
	const catalog = createQueryBuilderCatalog(
		async (typeName) => (fixture as Record<string, IntrospectionInputObject>)[typeName] ?? null,
		hasuraDialect,
		async (typeName) => (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null,
	);

	const fields = await catalog.readOutputObjectFields('pokemon');

	expect(fields.some((field) => field.fieldName === 'name' && field.kind === 'scalar')).toBe(true);
});

it('fetches an output type at most once', async () => {
	const requestedTypeNames: string[] = [];
	const catalog = createQueryBuilderCatalog(
		async () => null,
		hasuraDialect,
		async (typeName) => {
			requestedTypeNames.push(typeName);
			return (fixture as unknown as Record<string, IntrospectionOutputObject>)[typeName] ?? null;
		},
	);

	await catalog.readOutputObjectFields('pokemon');
	await catalog.readOutputObjectFields('pokemon');

	expect(requestedTypeNames).toEqual(['pokemon']);
});
```

Update the existing `createQueryBuilderCatalog` calls in that spec to pass a third argument.

- [ ] **Step 7: Extend the catalog**

Give the output fetcher its **own** pending map — a type name like `pokemon` exists as both an input and an output type, so one shared map would collide and return the wrong shape. Mirror the existing identity-guarded rejection eviction exactly.

- [ ] **Step 8: Add the HTTP output fetcher**

In `http-introspection-fetcher.ts`, add a sibling factory querying `fields` instead of `inputFields`:

```ts
const introspectOutputTypeQuery = `query IntrospectOutputType($typeName: String!) {
	__type(name: $typeName) {
		name
		kind
		fields { name type { kind name ofType { kind name ofType { kind name } } } }
	}
}`;
```

Same error handling as the existing fetcher: throw on a non-empty `errors` array, resolve `null` for `__type: null`. Add two tests mirroring the existing pair.

- [ ] **Step 9: Update the three call sites and the barrel**

`createQueryBuilderCatalog` now takes three arguments. Update `libs/domain-pokedex/.../query-explorer.component.ts` and any spec that constructs a catalog. Export the new module from `src/index.ts`.

- [ ] **Step 10: Verify all four**

```bash
npx tsc -p libs/ui-query-builder/tsconfig.lib.json --noEmit
npx tsc -p libs/ui-query-builder/tsconfig.spec.json --noEmit
pnpm nx test ui-query-builder
pnpm nx lint ui-query-builder
```

- [ ] **Step 11: Commit**

```bash
git add libs/ui-query-builder libs/domain-pokedex
git commit -m "feat(query-builder): read output object types from the catalog"
```

---

### Task 3: Metadata types, label resolution and the fallback

**Files:**
- Create: `libs/ui-query-builder/src/lib/metadata/query-builder-metadata.ts`
- Create: `libs/ui-query-builder/src/lib/metadata/humanize-name.ts`
- Create: `libs/ui-query-builder/src/lib/metadata/humanize-name.spec.ts`
- Create: `libs/ui-query-builder/src/lib/metadata/resolve-labels.ts`
- Create: `libs/ui-query-builder/src/lib/metadata/resolve-labels.spec.ts`
- Delete: `libs/ui-query-builder/src/lib/overlay/query-builder-overlay.ts`
- Modify: `libs/ui-query-builder/src/index.ts`
- Modify: every importer of the old overlay module

**Interfaces:**
- Consumes: `LiteralValue` from `core/model/literal-value`
- Produces: the metadata types, `QUERY_BUILDER_METADATA`, `QUERY_BUILDER_ENDPOINT` (moved unchanged), `emptyQueryBuilderMetadata`, `humanizeName`, `resolveResourceLabel`, `resolveFieldLabel`.

`QUERY_BUILDER_ENDPOINT` currently lives in the overlay file, which the previous review flagged as an odd home. It moves here with the rest of the injection surface. **Keep it factory-less** — a consumer that forgets to provide it must fail loudly rather than call the wrong host.

- [ ] **Step 1: Write the failing humanizer test**

The fallback is deliberately dumb. It is not a second naming strategy; it exists so an unknown name renders as something.

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm nx test ui-query-builder --testPathPatterns=humanize-name`
Expected: FAIL — cannot resolve `./humanize-name`.

- [ ] **Step 3: Write `humanize-name.ts`**

```ts
export function humanizeName(rawName: string): string {
	return rawName
		.split('_')
		.filter((word) => word.length > 0)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
```

- [ ] **Step 4: Write `query-builder-metadata.ts`**

```ts
import { InjectionToken } from '@angular/core';
import type { LiteralValue } from '../core/model/literal-value';

export interface ValueSource {
	readonly resourceName: string;
	readonly valueFieldName: string;
	readonly searchFieldName?: string;
}

export interface PinnedRule {
	readonly fieldPath: readonly string[];
	readonly operatorName: string;
	readonly value: LiteralValue;
}

export interface RelationScopeTemplate {
	readonly relationPath: readonly string[];
	readonly quantifier: 'some' | 'none';
	readonly pinnedRules: readonly PinnedRule[];
}

export interface FilterShortcut {
	readonly shortcutId: string;
	readonly displayName: string;
	readonly fieldPath: readonly string[];
	readonly scope?: RelationScopeTemplate;
	readonly valueSource?: ValueSource;
}

export interface ResourceMetadata {
	readonly resourceName: string;
	readonly displayName: string;
	readonly group: string;
	readonly priority: number;
	readonly shortcuts: readonly FilterShortcut[];
	readonly defaultSelectionFieldNames?: readonly string[];
	readonly fieldLabelOverrides?: Readonly<Record<string, string>>;
}

export interface QueryBuilderMetadata {
	readonly resources: readonly ResourceMetadata[];
	readonly resourceLabels: Readonly<Record<string, string>>;
	readonly fieldLabels: Readonly<Record<string, string>>;
}

export const emptyQueryBuilderMetadata: QueryBuilderMetadata = { resources: [], resourceLabels: {}, fieldLabels: {} };

export const QUERY_BUILDER_METADATA = new InjectionToken<QueryBuilderMetadata>('QUERY_BUILDER_METADATA', {
	providedIn: 'root',
	factory: () => emptyQueryBuilderMetadata,
});

export const QUERY_BUILDER_ENDPOINT = new InjectionToken<string>('QUERY_BUILDER_ENDPOINT');
```

- [ ] **Step 5: Write the failing label-resolution test**

Resolution order is the part that must not drift: a resource's name comes from `ResourceMetadata.displayName` when curated and `resourceLabels` otherwise; a field's comes from `fieldLabelOverrides`, then `fieldLabels`, then the fallback.

```ts
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
```

- [ ] **Step 6: Run it, watch it fail, then write `resolve-labels.ts`**

```ts
import { humanizeName } from './humanize-name';
import type { QueryBuilderMetadata } from './query-builder-metadata';

export function resolveResourceLabel(metadata: QueryBuilderMetadata, resourceName: string): string {
	const curated = metadata.resources.find((resource) => resource.resourceName === resourceName);
	if (curated) return curated.displayName;

	return metadata.resourceLabels[resourceName] ?? humanizeName(resourceName);
}

export function resolveFieldLabel(metadata: QueryBuilderMetadata, resourceName: string, fieldName: string): string {
	const curated = metadata.resources.find((resource) => resource.resourceName === resourceName);
	const override = curated?.fieldLabelOverrides?.[fieldName];
	if (override) return override;

	return metadata.fieldLabels[fieldName] ?? humanizeName(fieldName);
}
```

- [ ] **Step 7: Migrate the old overlay module**

Delete `overlay/query-builder-overlay.ts` and update every importer to the new module. `QUERY_BUILDER_OVERLAY`, `QueryBuilderOverlay`, `ResourceOverlay` and `emptyQueryBuilderOverlay` disappear; nothing should still reference them. Grep for each name and confirm zero hits before committing.

- [ ] **Step 8: Verify all four, then commit**

```bash
git add libs/ui-query-builder libs/domain-pokedex
git commit -m "feat(query-builder): add the metadata model, label resolution and fallback"
```

---

### Task 4: Shortcut expansion

**Files:**
- Create: `libs/ui-query-builder/src/lib/metadata/expand-shortcut.ts`
- Create: `libs/ui-query-builder/src/lib/metadata/expand-shortcut.spec.ts`
- Modify: `libs/ui-query-builder/src/index.ts`

**Interfaces:**
- Consumes: Task 3's `FilterShortcut`; `createFilterGroup`, `createFilterRule`, `QueryBuilderNode` from `core/model/query-tree`
- Produces: `expandShortcut(shortcut: FilterShortcut): QueryBuilderNode`

This is the piece that hides join tables, and it emits nodes the compiler already understands — no compiler change.

- [ ] **Step 1: Write the failing test**

```ts
import { expandShortcut } from './expand-shortcut';
import { isFilterGroup, isFilterRule } from '../core/model/query-tree';
import type { FilterShortcut } from './query-builder-metadata';

const typeShortcut: FilterShortcut = {
	shortcutId: 'type',
	displayName: 'Type',
	fieldPath: ['pokemontypes', 'type', 'name'],
	valueSource: { resourceName: 'type', valueFieldName: 'name' },
};

const baseSpeedShortcut: FilterShortcut = {
	shortcutId: 'baseSpeed',
	displayName: 'Base Speed',
	fieldPath: ['base_stat'],
	scope: {
		relationPath: ['pokemonstats'],
		quantifier: 'some',
		pinnedRules: [{ fieldPath: ['stat', 'name'], operatorName: '_eq', value: 'speed' }],
	},
};

describe('expandShortcut', () => {
	it('expands an unscoped shortcut into a single rule on its field path', () => {
		const node = expandShortcut(typeShortcut);

		expect(isFilterRule(node)).toBe(true);
		if (!isFilterRule(node)) return;
		expect(node.fieldPath).toEqual(['pokemontypes', 'type', 'name']);
		expect(node.operatorName).toBe('_eq');
	});

	it('expands a scoped shortcut into a relation-scoped group', () => {
		const node = expandShortcut(baseSpeedShortcut);

		expect(isFilterGroup(node)).toBe(true);
		if (!isFilterGroup(node)) return;
		expect(node.relationScope).toEqual({ fieldPath: ['pokemonstats'], quantifier: 'some' });
		expect(node.children).toHaveLength(2);
	});

	it('puts the pinned condition first and the editable rule last', () => {
		const node = expandShortcut(baseSpeedShortcut);
		if (!isFilterGroup(node)) throw new Error('expected a group');

		const [pinned, editable] = node.children;
		if (!isFilterRule(pinned) || !isFilterRule(editable)) throw new Error('expected two rules');

		expect(pinned.fieldPath).toEqual(['stat', 'name']);
		expect(pinned.operand).toEqual({ source: 'literal', value: 'speed' });
		expect(editable.fieldPath).toEqual(['base_stat']);
		expect(editable.operand).toEqual({ source: 'literal', value: null });
	});

	it('gives every expansion fresh node identifiers', () => {
		const first = expandShortcut(baseSpeedShortcut);
		const second = expandShortcut(baseSpeedShortcut);

		expect(first.nodeId).not.toBe(second.nodeId);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm nx test ui-query-builder --testPathPatterns=expand-shortcut`
Expected: FAIL — cannot resolve `./expand-shortcut`.

- [ ] **Step 3: Write `expand-shortcut.ts`**

```ts
import { createFilterGroup, createFilterRule, type QueryBuilderNode } from '../core/model/query-tree';
import type { FilterShortcut } from './query-builder-metadata';

const defaultOperatorName = '_eq';

export function expandShortcut(shortcut: FilterShortcut): QueryBuilderNode {
	const editableRule = createFilterRule({
		fieldPath: shortcut.fieldPath,
		operatorName: defaultOperatorName,
		operand: { source: 'literal', value: null },
	});

	if (!shortcut.scope) return editableRule;

	const pinnedRules = shortcut.scope.pinnedRules.map((pinned) =>
		createFilterRule({
			fieldPath: pinned.fieldPath,
			operatorName: pinned.operatorName,
			operand: { source: 'literal', value: pinned.value },
		}),
	);

	return createFilterGroup({
		relationScope: { fieldPath: shortcut.scope.relationPath, quantifier: shortcut.scope.quantifier },
		children: [...pinnedRules, editableRule],
	});
}
```

Note the editable rule carries `value: null`, which the compiler treats as an incomplete rule — so a freshly inserted shortcut correctly reports `incomplete` until the user picks a value.

- [ ] **Step 4: Run the test, verify it passes, export from the barrel, verify all four, commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): expand shortcuts into filter tree nodes"
```

---

### Task 5: The resource label table

**Files:**
- Create: `libs/domain-pokedex/src/lib/query-metadata/resource-labels.ts`
- Create: `libs/domain-pokedex/src/lib/query-metadata/resource-labels.spec.ts`

**Interfaces:**
- Consumes: Task 1's `schema-names.fixture.json`
- Produces: `export const pokedexResourceLabels: Readonly<Record<string, string>>` — **160 entries, one per resource name in the manifest.**

This is authored data, not computed. Work from the manifest so the list is exact.

- [ ] **Step 1: Write the coverage test first**

The test defines "done" — it fails until every resource in the manifest has an entry, and names the missing ones.

```ts
import schemaNames from '../../../../ui-query-builder/src/lib/core/metadata/__fixtures__/schema-names.fixture.json';
import { pokedexResourceLabels } from './resource-labels';

describe('pokedexResourceLabels', () => {
	it('covers every resource in the schema', () => {
		const missing = schemaNames.resourceNames.filter((resourceName) => !pokedexResourceLabels[resourceName]);

		expect(missing).toEqual([]);
	});

	it('has no entry for a resource that no longer exists', () => {
		const known = new Set(schemaNames.resourceNames);
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
```

Adjust the relative fixture path if the domain library's tsconfig cannot reach across libraries; if so, import it through the `@pokemon-center/ui-query-builder` barrel instead by re-exporting the manifest there, and say which you did in your report.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm nx test domain-pokedex --testPathPatterns=resource-labels`
Expected: FAIL — cannot resolve `./resource-labels`.

- [ ] **Step 3: Author the table**

Read `schema-names.fixture.json` for the exact 160 names. Write entries in that order.

Conventions:
- Title Case, singular, as a person would say it: `pokemon` → `'Pokémon'`, `egggroup` → `'Egg Group'`, `versiongroup` → `'Version Group'`
- **Accents:** `'Pokémon'` and `'Pokédex'` carry theirs
- **Hasura mis-singularisations:** `pokemonspecy` → `'Species'`, not `'Pokemon Specy'`
- **Game acronyms stay uppercase:** anything containing `hp` → `'HP'`, `pp` → `'PP'`
- **Join tables get the relationship, not the table:** `pokemonegggroup` → `'Pokémon Egg Group'`
- **Text tables say what they hold:** `abilityflavortext` → `'Ability Flavor Text'`, `pokemonspeciesdescription` → `'Pokémon Species Description'`
- **Past-state tables:** `pokemontypepast` → `'Past Type'`, `pokemonabilitypast` → `'Past Ability'`

Format:

```ts
export const pokedexResourceLabels: Readonly<Record<string, string>> = {
	ability: 'Ability',
	abilitychange: 'Ability Change',
	abilitychangeeffecttext: 'Ability Change Effect Text',
	// … 157 more, alphabetical, matching the manifest exactly
};
```

- [ ] **Step 4: Run the coverage test until green**

Run: `pnpm nx test domain-pokedex --testPathPatterns=resource-labels`
Expected: PASS, 3 tests. The first failure message lists exactly which names are missing — work from it.

- [ ] **Step 5: Commit**

```bash
git add libs/domain-pokedex/src/lib/query-metadata
git commit -m "feat(pokedex): add display names for every query builder resource"
```

---

### Task 6: The field label table

**Files:**
- Create: `libs/domain-pokedex/src/lib/query-metadata/field-labels.ts`
- Create: `libs/domain-pokedex/src/lib/query-metadata/field-labels.spec.ts`

**Interfaces:**
- Consumes: Task 1's manifest
- Produces: `export const pokedexFieldLabels: Readonly<Record<string, string>>` — **385 entries, one per distinct field name.**

- [ ] **Step 1: Write the coverage test**

Same three assertions as Task 5, against `schemaNames.fieldNames` and `pokedexFieldLabels`. Repeat the test code rather than sharing a helper — the two files are read independently and a shared helper would obscure which table is failing.

```ts
import schemaNames from '../../../../ui-query-builder/src/lib/core/metadata/__fixtures__/schema-names.fixture.json';
import { pokedexFieldLabels } from './field-labels';

describe('pokedexFieldLabels', () => {
	it('covers every distinct field name in the schema', () => {
		const missing = schemaNames.fieldNames.filter((fieldName) => !pokedexFieldLabels[fieldName]);

		expect(missing).toEqual([]);
	});

	it('has no entry for a field that no longer exists', () => {
		const known = new Set(schemaNames.fieldNames);
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
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Author the table**

The 385 names split into three shapes, and the third is where the value is:

**Snake_case columns** — mechanical: `base_stat` → `'Base Stat'`, `capture_rate` → `'Capture Rate'`, `is_default` → `'Is Default'`. Exceptions: `id` → `'ID'`, `hp` → `'HP'`, `pokedex_number` → `'Pokédex Number'`.

**Run-together relation names** — say the thing, not the table: `pokemonstats` → `'Stats'`, `pokemonmoves` → `'Moves'`, `pokemontypes` → `'Types'`, `pokemonabilities` → `'Abilities'`, `pokemonspecy` → `'Species'`, `abilityflavortexts` → `'Flavor Text'`.

**Hasura foreign-key disambiguation (`XByYId`)** — these are the ones that need understanding. The suffix names the *role*:

```ts
PokemonspecyByPartySpeciesId: 'Party Species',
PokemonspecyByTradeSpeciesId: 'Trade Species',
TypeByTargetTypeId: 'Target Type',
TypeByPartyTypeId: 'Party Type',
BerryflavorByLikesFlavorId: 'Liked Flavor',
NaturesByLikesFlavorId: 'Natures Liking This Flavor',
NaturesByIncreasedStatId: 'Natures Increasing This Stat',
StatByIncreasedStatId: 'Increased Stat',
StatByDecreasedStatId: 'Decreased Stat',
ItemByHeldItemId: 'Held Item',
MoveBySecondMoveId: 'Second Move',
ContestcombosBySecondMoveId: 'Second Move Combos',
LanguageByLocalLanguageId: 'Language',
PokemonevolutionsByHeldItemId: 'Evolutions Requiring This Item',
```

Read the manifest for the full list; the pattern is `<TargetTable>By<Role>Id` → name the role.

- [ ] **Step 4: Run until green, then commit**

```bash
git add libs/domain-pokedex/src/lib/query-metadata
git commit -m "feat(pokedex): add display names for every query builder field"
```

---

### Task 7: Curated resources, shortcuts and the assembled metadata

**Files:**
- Create: `libs/domain-pokedex/src/lib/query-metadata/curated-resources.ts`
- Create: `libs/domain-pokedex/src/lib/query-metadata/pokedex-query-builder-metadata.ts`
- Create: `libs/domain-pokedex/src/lib/query-metadata/pokedex-query-builder-metadata.spec.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6; the expanded fixture from Task 1
- Produces: `pokedexCuratedResources: readonly ResourceMetadata[]`, `pokedexQueryBuilderMetadata: QueryBuilderMetadata`

This is the judgment task. It is also where the drift test lives — the guard that stops a curated path rotting silently.

- [ ] **Step 1: Write the drift test first**

It walks every curated path against the real fixture. A renamed column fails the build naming the shortcut.

```ts
import fixture from '../../../../ui-query-builder/src/lib/core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect, readBooleanExpression, type IntrospectionInputObject } from '@pokemon-center/ui-query-builder';
import { pokedexQueryBuilderMetadata } from './pokedex-query-builder-metadata';

const typedFixture = fixture as unknown as Record<string, IntrospectionInputObject>;

function resolvePath(rootTypeName: string, fieldPath: readonly string[]): string | null {
	let currentTypeName = rootTypeName;

	for (const [index, segment] of fieldPath.entries()) {
		const inputObject = typedFixture[currentTypeName];
		if (!inputObject) return `type ${currentTypeName} is not in the fixture`;

		const descriptor = readBooleanExpression(inputObject, hasuraDialect).find((field) => field.fieldName === segment);
		if (!descriptor) return `${currentTypeName} has no field ${segment}`;

		const isLast = index === fieldPath.length - 1;
		if (isLast) return descriptor.kind === 'scalar' ? null : `${segment} is not a scalar leaf`;
		if (descriptor.kind !== 'relation') return `${segment} is not a relation`;

		currentTypeName = descriptor.booleanExpressionTypeName;
	}

	return 'empty field path';
}

describe('curated query builder metadata', () => {
	it('every curated resource has a boolean expression type in the fixture', () => {
		const missing = pokedexQueryBuilderMetadata.resources
			.filter((resource) => !typedFixture[`${resource.resourceName}_bool_exp`])
			.map((resource) => resource.resourceName);

		expect(missing).toEqual([]);
	});

	it('every shortcut resolves to a scalar leaf', () => {
		const failures: string[] = [];

		for (const resource of pokedexQueryBuilderMetadata.resources) {
			for (const shortcut of resource.shortcuts) {
				const fullPath = shortcut.scope ? [...shortcut.scope.relationPath, ...shortcut.fieldPath] : shortcut.fieldPath;
				const problem = resolvePath(`${resource.resourceName}_bool_exp`, fullPath);
				if (problem) failures.push(`${resource.resourceName}.${shortcut.shortcutId}: ${problem}`);
			}
		}

		expect(failures).toEqual([]);
	});

	it('every pinned rule inside a scope resolves too', () => {
		const failures: string[] = [];

		for (const resource of pokedexQueryBuilderMetadata.resources) {
			for (const shortcut of resource.shortcuts) {
				for (const pinned of shortcut.scope?.pinnedRules ?? []) {
					const fullPath = [...(shortcut.scope?.relationPath ?? []), ...pinned.fieldPath];
					const problem = resolvePath(`${resource.resourceName}_bool_exp`, fullPath);
					if (problem) failures.push(`${resource.resourceName}.${shortcut.shortcutId} pinned: ${problem}`);
				}
			}
		}

		expect(failures).toEqual([]);
	});

	it('every value source names a resource that exists', () => {
		const failures: string[] = [];

		for (const resource of pokedexQueryBuilderMetadata.resources) {
			for (const shortcut of resource.shortcuts) {
				const source = shortcut.valueSource;
				if (source && !typedFixture[`${source.resourceName}_bool_exp`]) {
					failures.push(`${resource.resourceName}.${shortcut.shortcutId} -> ${source.resourceName}`);
				}
			}
		}

		expect(failures).toEqual([]);
	});

	it('assembles the label tables', () => {
		expect(Object.keys(pokedexQueryBuilderMetadata.resourceLabels).length).toBeGreaterThan(150);
		expect(Object.keys(pokedexQueryBuilderMetadata.fieldLabels).length).toBeGreaterThan(350);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm nx test domain-pokedex --testPathPatterns=pokedex-query-builder-metadata`
Expected: FAIL — cannot resolve `./pokedex-query-builder-metadata`.

- [ ] **Step 3: Write the curated resources**

Twenty resources across four groups. Priority sorts within a group, higher first.

```ts
import type { ResourceMetadata } from '@pokemon-center/ui-query-builder';

export const pokedexCuratedResources: readonly ResourceMetadata[] = [
	{
		resourceName: 'pokemon',
		displayName: 'Pokémon',
		group: 'Core',
		priority: 100,
		defaultSelectionFieldNames: ['id', 'name'],
		shortcuts: [
			{
				shortcutId: 'type',
				displayName: 'Type',
				fieldPath: ['pokemontypes', 'type', 'name'],
				valueSource: { resourceName: 'type', valueFieldName: 'name' },
			},
			{
				shortcutId: 'ability',
				displayName: 'Ability',
				fieldPath: ['pokemonabilities', 'ability', 'name'],
				valueSource: { resourceName: 'ability', valueFieldName: 'name' },
			},
			{
				shortcutId: 'learnsMove',
				displayName: 'Learns move',
				fieldPath: ['pokemonmoves', 'move', 'name'],
				valueSource: { resourceName: 'move', valueFieldName: 'name' },
			},
			{
				shortcutId: 'baseSpeed',
				displayName: 'Base Speed',
				fieldPath: ['base_stat'],
				scope: {
					relationPath: ['pokemonstats'],
					quantifier: 'some',
					pinnedRules: [{ fieldPath: ['stat', 'name'], operatorName: '_eq', value: 'speed' }],
				},
			},
			// the same shape for hp, attack, defense, special-attack, special-defense
			{ shortcutId: 'name', displayName: 'Name', fieldPath: ['name'] },
			{ shortcutId: 'height', displayName: 'Height', fieldPath: ['height'] },
			{ shortcutId: 'weight', displayName: 'Weight', fieldPath: ['weight'] },
		],
	},
	{
		resourceName: 'move',
		displayName: 'Move',
		group: 'Core',
		priority: 90,
		defaultSelectionFieldNames: ['id', 'name', 'power', 'accuracy'],
		shortcuts: [
			{ shortcutId: 'name', displayName: 'Name', fieldPath: ['name'] },
			{
				shortcutId: 'type',
				displayName: 'Type',
				fieldPath: ['type', 'name'],
				valueSource: { resourceName: 'type', valueFieldName: 'name' },
			},
			{ shortcutId: 'power', displayName: 'Power', fieldPath: ['power'] },
			{ shortcutId: 'accuracy', displayName: 'Accuracy', fieldPath: ['accuracy'] },
			{ shortcutId: 'priority', displayName: 'Priority', fieldPath: ['priority'] },
			{
				shortcutId: 'damageClass',
				displayName: 'Damage Class',
				fieldPath: ['movedamageclass', 'name'],
				valueSource: { resourceName: 'movedamageclass', valueFieldName: 'name' },
			},
			{
				shortcutId: 'learnedBy',
				displayName: 'Learned by',
				fieldPath: ['pokemonmoves', 'pokemon', 'name'],
				valueSource: { resourceName: 'pokemon', valueFieldName: 'name' },
			},
		],
	},
];
```

Remaining resources to write, same shape — **Core:** Ability, Item, Type. **Classification:** Species, Egg Group, Nature, Growth Rate, Characteristic. **World:** Region, Location, Encounter, Version Group, Generation. **Mechanics:** Stat, Machine, Evolution, Contest.

Priorities run downward within a group in the order listed, starting at 100 and stepping by 10, so a later addition can slot between two existing entries without renumbering.

Confirm every path against the fixture before writing it. The drift test catches mistakes, but reading `hasura-introspection.fixture.json` first is faster than a failing test cycle — and note that some paths are shorter than they look: a move's type is `type.name` directly, while a Pokémon's is `pokemontypes.type.name` through a join table.

Give each curated resource at least the shortcuts a person would actually reach for. Use the fixture to confirm each path before writing it — the drift test will catch mistakes, but reading the fixture first is faster than guessing.

**The six stat shortcuts share one shape.** Write them out rather than generating them in a loop: they are data, and a reader should be able to see `hp` without tracing a mapping.

- [ ] **Step 4: Assemble the metadata**

```ts
import type { QueryBuilderMetadata } from '@pokemon-center/ui-query-builder';
import { pokedexCuratedResources } from './curated-resources';
import { pokedexFieldLabels } from './field-labels';
import { pokedexResourceLabels } from './resource-labels';

export const pokedexQueryBuilderMetadata: QueryBuilderMetadata = {
	resources: pokedexCuratedResources,
	resourceLabels: pokedexResourceLabels,
	fieldLabels: pokedexFieldLabels,
};
```

- [ ] **Step 5: Run the drift test until green, verify all four, commit**

```bash
git add libs/domain-pokedex/src/lib/query-metadata
git commit -m "feat(pokedex): curate query builder resources, shortcuts and value sources"
```

---

### Task 8: The search-select primitive

**Files:**
- Create: `libs/ui-pokedex/src/lib/search-select/search-select.component.ts`
- Create: `libs/ui-pokedex/src/lib/search-select/search-select.component.spec.ts`
- Modify: `libs/ui-pokedex/src/index.ts`

**Interfaces:**
- Consumes: nothing from this plan
- Produces:

```ts
interface SearchSelectOption { readonly value: string; readonly label: string; readonly group?: string; readonly hint?: string }
// selector: pokedex-search-select
// inputs:  options: readonly SearchSelectOption[] · value: string | null · placeholder: string
//          loading: boolean · errorMessage: string | null · searchable: boolean
// outputs: valueChosen: string · searchTextChanged: string
```

**Invoke the `pokedex-component` skill before writing any component code.** It carries this workspace's recipe for tokens, CDK usage and accessibility.

It is **presentational** — it never fetches. `searchTextChanged` lets a caller drive async options; a caller with static options simply ignores it and lets the component filter locally.

- [ ] **Step 1: Write the failing test**

```ts
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { SearchSelectComponent } from './search-select.component';

const options = [
	{ value: 'pokemon', label: 'Pokémon', group: 'Core' },
	{ value: 'move', label: 'Move', group: 'Core' },
	{ value: 'berryflavor', label: 'Berry Flavor', group: 'Everything else' },
];

describe('SearchSelectComponent', () => {
	let spectator: Spectator<SearchSelectComponent>;
	const createComponent = createComponentFactory({ component: SearchSelectComponent });

	it('shows the chosen option label on the trigger', () => {
		spectator = createComponent({ props: { options, value: 'move', placeholder: 'Choose' } });

		expect(spectator.query('[data-testid="search-select-trigger"]')).toHaveText('Move');
	});

	it('shows the placeholder when nothing is chosen', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose a resource' } });

		expect(spectator.query('[data-testid="search-select-trigger"]')).toHaveText('Choose a resource');
	});

	it('lists every option grouped when opened', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		spectator.click('[data-testid="search-select-trigger"]');

		expect(spectator.queryAll('[data-testid="search-select-option"]')).toHaveLength(3);
		expect(spectator.queryAll('[data-testid="search-select-group"]')).toHaveLength(2);
	});

	it('filters options by typed text, matching the label not the raw value', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		spectator.click('[data-testid="search-select-trigger"]');
		spectator.typeInElement('berry', '[data-testid="search-select-search"]');
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toEqual(['Berry Flavor']);
	});

	it('emits the raw value, not the label, when an option is chosen', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		const chosen: string[] = [];
		spectator.component.valueChosen.subscribe((value: string) => chosen.push(value));

		spectator.click('[data-testid="search-select-trigger"]');
		spectator.click('[data-testid="search-select-option"]');

		expect(chosen).toEqual(['pokemon']);
	});

	it('emits the search text so a caller can drive async options', () => {
		spectator = createComponent({ props: { options: [], value: null, placeholder: 'Choose' } });
		const searches: string[] = [];
		spectator.component.searchTextChanged.subscribe((text: string) => searches.push(text));

		spectator.click('[data-testid="search-select-trigger"]');
		spectator.typeInElement('raz', '[data-testid="search-select-search"]');

		expect(searches).toContain('raz');
	});

	it('shows a loading state instead of "no matches" while options are in flight', () => {
		spectator = createComponent({ props: { options: [], value: null, placeholder: 'Choose', loading: true } });
		spectator.click('[data-testid="search-select-trigger"]');

		expect(spectator.query('[data-testid="search-select-loading"]')).toExist();
		expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();
	});

	it('distinguishes an error from an empty result', () => {
		spectator = createComponent({ props: { options: [], value: null, placeholder: 'Choose', errorMessage: 'Request failed' } });
		spectator.click('[data-testid="search-select-trigger"]');

		expect(spectator.query('[data-testid="search-select-error"]')).toHaveText('Request failed');
		expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();
	});

	it('exposes combobox semantics on the trigger', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		const trigger = spectator.query('[data-testid="search-select-trigger"]');

		expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
		expect(trigger).toHaveAttribute('aria-expanded', 'false');

		spectator.click('[data-testid="search-select-trigger"]');
		expect(spectator.query('[data-testid="search-select-trigger"]')).toHaveAttribute('aria-expanded', 'true');
	});

	it('closes on Escape without choosing anything', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		const chosen: string[] = [];
		spectator.component.valueChosen.subscribe((value: string) => chosen.push(value));

		spectator.click('[data-testid="search-select-trigger"]');
		spectator.dispatchKeyboardEvent('[data-testid="search-select-search"]', 'keydown', 'Escape');
		spectator.detectChanges();

		expect(spectator.query('[data-testid="search-select-option"]')).not.toExist();
		expect(chosen).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it, watch it fail, then implement**

Standalone, `OnPush`, signal inputs. `CdkConnectedOverlay` + `CdkOverlayOrigin` for the panel, `CdkTrapFocus` inside it, `CdkListbox`/`CdkOption` for the options — the same combination `field-path-picker` already uses. Arrow keys move between options, Enter chooses, Escape closes. Styling from `ui-pokedex` tokens only.

Local filtering is case-insensitive on `label`. When `searchable` is false, hide the search input and skip filtering.

- [ ] **Step 3: Verify and commit**

```bash
pnpm nx test ui-pokedex && pnpm nx lint ui-pokedex
git add libs/ui-pokedex
git commit -m "feat(ui-pokedex): add a searchable select primitive"
```

---

### Task 9: Value source search over HTTP

**Files:**
- Create: `libs/ui-query-builder/src/lib/session/value-source-search.ts`
- Create: `libs/ui-query-builder/src/lib/session/value-source-search.spec.ts`
- Modify: `libs/ui-query-builder/src/index.ts`

**Interfaces:**
- Consumes: Task 3's `ValueSource` and `QUERY_BUILDER_ENDPOINT`; existing `value-nodes` helpers
- Produces:

```ts
interface ValueOption { readonly value: string; readonly label: string }
function createValueSourceSearch(): (source: ValueSource, searchText: string) => Promise<readonly ValueOption[]>;
```

One code path for every value picker: empty search on focus returns the first 50; typed search filters with `_ilike`.

- [ ] **Step 1: Write the failing test**

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QUERY_BUILDER_ENDPOINT } from '../metadata/query-builder-metadata';
import { createValueSourceSearch } from './value-source-search';

function setup() {
	TestBed.configureTestingModule({
		providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
	});
	const search = TestBed.runInInjectionContext(() => createValueSourceSearch());
	return { search, controller: TestBed.inject(HttpTestingController) };
}

describe('value source search', () => {
	it('queries without a filter when the search text is empty, limited to 50', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'type', valueFieldName: 'name' }, '');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('type(');
		expect(request.request.body.query).toContain('limit: 50');
		expect(request.request.body.query).not.toContain('_ilike');

		request.flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });

		await expect(pending).resolves.toEqual([
			{ value: 'grass', label: 'Grass' },
			{ value: 'fire', label: 'Fire' },
		]);
		controller.verify();
	});

	it('filters with _ilike when search text is given', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'move', valueFieldName: 'name' }, 'razor');

		const request = controller.expectOne('/api/graphql');
		expect(request.request.body.query).toContain('_ilike');
		expect(request.request.body.variables).toEqual({ searchText: '%razor%' });

		request.flush({ data: { move: [{ name: 'razor-leaf' }] } });

		await expect(pending).resolves.toEqual([{ value: 'razor-leaf', label: 'Razor Leaf' }]);
	});

	it('humanizes the label but emits the raw slug as the value', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'move', valueFieldName: 'name' }, '');

		controller.expectOne('/api/graphql').flush({ data: { move: [{ name: 'double-edge' }] } });

		await expect(pending).resolves.toEqual([{ value: 'double-edge', label: 'Double Edge' }]);
	});

	it('searches a different field when searchFieldName is given', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'item', valueFieldName: 'name', searchFieldName: 'name' }, 'ball');

		const request = controller.expectOne('/api/graphql');
		request.flush({ data: { item: [] } });

		await expect(pending).resolves.toEqual([]);
	});

	it('throws when the response carries graphql errors', async () => {
		const { search, controller } = setup();
		const pending = search({ resourceName: 'type', valueFieldName: 'name' }, '');

		controller.expectOne('/api/graphql').flush({ errors: [{ message: 'field "type" not found' }] });

		await expect(pending).rejects.toThrow('field "type" not found');
	});
});
```

- [ ] **Step 2: Run it, watch it fail, then implement**

Build the document with the `graphql` AST helpers already in `core/compiler/value-nodes.ts` and `print()` — do not concatenate strings. The label humanizer here turns slugs into words: split on `-` and `_`, title-case each part. Reuse `humanizeName` after replacing dashes with underscores rather than writing a second humanizer.

- [ ] **Step 3: Verify all four and commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): search value sources over http"
```

---

### Task 10: Resource picker and metadata wiring

**Files:**
- Modify: `libs/ui-query-builder/src/lib/components/query-builder/query-builder.component.ts` + spec
- Modify: `libs/domain-pokedex/src/lib/features/query-explorer/query-explorer.component.ts` + spec
- Modify: `libs/domain-pokedex/src/lib/lib.routes.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7, 8
- Produces: the shell renders `pokedex-search-select` for the resource; `QUERY_BUILDER_METADATA` provided at the route.

- [ ] **Step 1: Write the failing shell test**

```ts
it('groups resources and sorts curated ones above the tail', async () => {
	// resources input: pokemon, move, berryflavor (in that arbitrary order)
	// metadata: pokemon priority 100 group Core, move priority 90 group Core, berryflavor uncurated
	spectator.click('[data-testid="resource-select"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const groups = spectator.queryAll('[data-testid="search-select-group"]').map((group) => group.textContent?.trim());
	expect(groups[0]).toBe('Core');
	expect(groups.at(-1)).toBe('Everything else');
});

it('labels resources from the metadata, never raw', async () => {
	spectator.click('[data-testid="resource-select"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toContain('Pokémon');
	expect(labels).not.toContain('pokemon');
});
```

- [ ] **Step 2: Implement**

Inject `QUERY_BUILDER_METADATA`. Map the `resources` input into `SearchSelectOption[]`: label via `resolveResourceLabel`, group from `ResourceMetadata.group` or `'Everything else'`. Sort by group order (`Core`, `Classification`, `World`, `Mechanics`, `Everything else`), then by descending priority, then by label.

- [ ] **Step 3: Provide the metadata at the route**

In `lib.routes.ts`, add to the `query-explorer` route's providers:

```ts
{ provide: QUERY_BUILDER_METADATA, useValue: pokedexQueryBuilderMetadata },
```

- [ ] **Step 4: Verify five and commit**

Add `pnpm nx test domain-pokedex` and `pnpm nx build pokemon-center` to the usual four.

```bash
git add libs/ui-query-builder libs/domain-pokedex
git commit -m "feat(query-builder): choose the resource from a grouped searchable list"
```

---

### Task 11: Shortcut-first field picker

**Files:**
- Modify: `libs/ui-query-builder/src/lib/components/filter-rule/filter-rule.component.ts` + spec
- Modify: `libs/ui-query-builder/src/lib/components/field-path-picker/field-path-picker.component.ts` + spec

**Interfaces:**
- Consumes: Tasks 3, 4, 7, 8
- Produces: the rule editor offers shortcuts first and reveals the raw graph behind an Advanced affordance; every level of the picker is labelled and searchable.

- [ ] **Step 1: Write the failing tests**

```ts
it('offers the curated shortcuts for the current resource, by display name', async () => {
	spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toContain('Type');
	expect(labels).toContain('Base Speed');
	expect(labels).not.toContain('pokemontypes');
});

it('choosing a scoped shortcut emits a relation-scoped group, not a bare rule', async () => {
	const emitted: QueryBuilderNode[] = [];
	spectator.component.shortcutChosen.subscribe((node: QueryBuilderNode) => emitted.push(node));

	spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const baseSpeedOption = spectator
		.queryAll('[data-testid="search-select-option"]')
		.find((option) => option.textContent?.trim() === 'Base Speed');
	spectator.click(baseSpeedOption as HTMLElement);

	expect(emitted).toHaveLength(1);
	const [node] = emitted;
	expect(isFilterGroup(node)).toBe(true);
	if (!isFilterGroup(node)) return;
	expect(node.relationScope).toEqual({ fieldPath: ['pokemonstats'], quantifier: 'some' });
	expect(node.children).toHaveLength(2);
});

it('renders a pinned condition as fixed context, not as an editable rule', async () => {
	spectator = createComponent({ props: { ...baseProps, rule: baseSpeedGroupChild } });
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	expect(spectator.query('[data-testid="pinned-condition"]')).toHaveText('Stat is Speed');
	expect(spectator.query('[data-testid="pinned-condition"] input')).not.toExist();
});

it('hides a curated shortcut whose path no longer resolves', async () => {
	const catalogWithoutStats = createQueryBuilderCatalog(
		async (typeName) => (typeName === 'pokemonstat_bool_exp' ? null : fixtureFetcher(typeName)),
		hasuraDialect,
		outputFetcher,
	);
	spectator = createComponent({ props: { ...baseProps, catalog: catalogWithoutStats } });

	spectator.click('[data-testid="field-select"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toContain('Type');
	expect(labels).not.toContain('Base Speed');
});

it('the advanced affordance reveals the labelled raw graph', async () => {
	spectator.click('[data-testid="field-advanced"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toContain('Stats');
	expect(labels).not.toContain('pokemonstats');
});

it('operator options still come from the catalog, not a hardcoded list', async () => {
	// Int field -> exactly 9 operators and no _ilike; String field -> 19.
	// This assertion already exists and must survive the rewrite.
});
```

That last one is load-bearing: it is the assertion proving the UI is introspection-driven, and it must not be weakened by this task.

- [ ] **Step 2: Implement**

Shortcuts render first from `ResourceMetadata.shortcuts` for the current resource. Choosing one calls `expandShortcut` and emits the node through a new `shortcutChosen: output<QueryBuilderNode>()`. Pinned rules render as fixed context — visible, not editable — reading as "Stat is Speed" via `resolveFieldLabel` plus the humanized value.

**Unresolvable shortcuts are hidden, per the spec's error table.** Before rendering the shortcut list, resolve each shortcut's full path against the catalog exactly as the drift test does; drop any that fail. A schema change should quietly cost a shortcut, not present a control that produces a broken query. The drift test is what makes this loud at build time; this is the runtime half.

The raw drill-down stays behind an "Advanced" toggle, with every level labelled through `resolveFieldLabel` and each level a `pokedex-search-select`.

- [ ] **Step 3: Verify all four and commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): offer named shortcuts before the raw relation graph"
```

---

### Task 12: Value pickers, and the remaining text boxes

**Files:**
- Modify: `libs/ui-query-builder/src/lib/components/operand-editor/operand-editor.component.ts` + spec
- Modify: `libs/ui-query-builder/src/lib/components/filter-group/filter-group.component.ts` + spec
- Modify: `libs/ui-query-builder/src/lib/components/selection-editor/selection-editor.component.ts` + spec
- Modify: `libs/ui-query-builder/src/lib/session/query-builder.store.ts` + spec

**Interfaces:**
- Consumes: Tasks 2, 8, 9
- Produces: no free-text inputs remain except genuine numbers and text.

Four sites, one shape: replace a text box with `pokedex-search-select`.

- [ ] **Step 1: Write the failing tests**

```ts
it('offers value options from the shortcut value source, humanized, and emits the raw slug', async () => {
	spectator = createComponent({
		props: { operand: { source: 'literal', value: null }, valueSource: { resourceName: 'type', valueFieldName: 'name' } },
	});
	const emitted: FilterOperand[] = [];
	spectator.component.operandChange.subscribe((operand: FilterOperand) => emitted.push(operand));

	spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
	httpMock.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }, { name: 'fire' }] } });
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toEqual(['Grass', 'Fire']);

	spectator.click('[data-testid="search-select-option"]');
	expect(emitted).toEqual([{ source: 'literal', value: 'grass' }]);
});

it('shows an error rather than an empty list when the value query fails', async () => {
	spectator = createComponent({
		props: { operand: { source: 'literal', value: null }, valueSource: { resourceName: 'type', valueFieldName: 'name' } },
	});

	spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
	httpMock.expectOne('/api/graphql').flush({ errors: [{ message: 'field "type" not found' }] });
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	expect(spectator.query('[data-testid="search-select-error"]')).toContainText('not found');
	expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();
});

it('picks the relation scope path instead of typing it', async () => {
	spectator.click('[data-testid="relation-scope-select"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toContain('Stats');
	expect(labels).not.toContain('pokemonstats');
	expect(spectator.query('[data-testid="relation-scope-input"]')).not.toExist();
});

it('picks selection fields from the output type', async () => {
	spectator.click('[data-testid="selection-add"] [data-testid="search-select-trigger"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
	expect(labels).toContain('Base Experience');
	expect(labels).not.toContain('base_experience');
	expect(spectator.query('[data-testid="selection-field-input"]')).not.toExist();
});

it('resets both filter and selection when the resource changes', () => {
	const store = createStore();
	store.selectResource('pokemon');
	store.setSelection({ fieldName: '', children: [{ fieldName: 'name', children: [] }] });

	store.selectResource('move');

	expect(store.filter().children).toEqual([]);
	expect(store.selection().children).toEqual([]);
});
```

That last test fixes a defect the previous review found: `selectResource` resets the filter but leaves the selection, so switching resources compiles a query selecting one table's fields from another.

- [ ] **Step 2: Implement**

- **Operand editor** — when the rule's shortcut declares a `valueSource`, render a `pokedex-search-select` driven by `createValueSourceSearch`: query on focus with empty text, re-query on `searchTextChanged` with a 200ms debounce. Numbers and free text keep the existing typed input and its coercion.
- **Filter group** — relation scope becomes a picker over the catalog's to-many relations, labelled.
- **Selection editor** — options come from `catalog.readOutputObjectFields(resourceName)`, labelled, multi-add. This retires the free-text field names.
- **Store** — `selectResource` also resets `selection`, `ordering`, `resolvedValues`, `variableTypeNames` and `comparisonTypeNames`.

Subquery resource and field path in the operand editor become pickers too, using the same select.

- [ ] **Step 3: Verify all four and commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): replace the remaining text boxes with pickers"
```

---

### Task 13: End-to-end, by choosing

**Files:**
- Modify: `libs/ui-query-builder/src/lib/components/query-builder/query-builder.component.spec.ts`

**Interfaces:**
- Consumes: everything
- Produces: proof the picker path and the compiler agree.

The previous round's whole-branch review found four defects that survived sixteen task reviews because no test drove the UI and inspected the emitted document. This is the test that stops that recurring for the choosing layer.

- [ ] **Step 1: Write the failing test**

Compose by *choosing* — resource from the select, shortcut from the field select, value from the value select — then assert the printed document.

```ts
async function chooseOption(spectator: Spectator<QueryBuilderComponent>, selectTestId: string, label: string) {
	spectator.click(`[data-testid="${selectTestId}"] [data-testid="search-select-trigger"]`);
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	const option = spectator
		.queryAll('[data-testid="search-select-option"]')
		.find((candidate) => candidate.textContent?.trim() === label);
	if (!option) throw new Error(`no option labelled ${label} in ${selectTestId}`);

	spectator.click(option as HTMLElement);
	await spectator.fixture.whenStable();
	spectator.detectChanges();
}

it('composes a query entirely through pickers and compiles it correctly', async () => {
	await chooseOption(spectator, 'resource-select', 'Pokémon');

	spectator.click('[data-testid="add-rule"]');
	await spectator.fixture.whenStable();
	spectator.detectChanges();

	await chooseOption(spectator, 'field-select', 'Type');

	spectator.click('[data-testid="value-select"] [data-testid="search-select-trigger"]');
	httpMock.expectOne('/api/graphql').flush({ data: { type: [{ name: 'grass' }] } });
	await spectator.fixture.whenStable();
	spectator.detectChanges();
	spectator.click('[data-testid="search-select-option"]');
	await spectator.fixture.whenStable();

	const result = store.compileResult();
	expect(result.status).toBe('complete');
	if (result.status !== 'complete') return;

	expect(result.document).toBe(
		print(
			parse(`query BuiltQuery {
				pokemon(
					where: {_and: [{pokemontypes: {type: {name: {_eq: "grass"}}}}]}
					order_by: {id: asc}
					limit: 50
				) {
					id
					name
				}
			}`),
		),
	);
});
```

Normalise both sides through `print(parse(...))`. The printer emits no inner brace padding and breaks long argument lists without commas, so hand-written expected output is always wrong.

If the produced document differs semantically, **the components are wiring the metadata wrongly — fix the components, not the expectation.** If you believe the expectation itself is wrong, STOP and report BLOCKED with both documents.

- [ ] **Step 2: Run it, watch it fail for the right reason, make it pass**

- [ ] **Step 3: Full verification**

```bash
npx tsc -p libs/ui-query-builder/tsconfig.lib.json --noEmit
npx tsc -p libs/ui-query-builder/tsconfig.spec.json --noEmit
pnpm nx test ui-query-builder
pnpm nx test domain-pokedex
pnpm nx test ui-pokedex
pnpm nx lint ui-query-builder && pnpm nx lint domain-pokedex && pnpm nx lint ui-pokedex
pnpm nx build pokemon-center
```

- [ ] **Step 4: Manual verification**

With Hasura on 8080 and `pokedex-service` running (the nuzlocke shell needs it, or the page errors before mounting):

```bash
pnpm start
```

Visit `http://localhost:4200/nuzlocke/pokedex/query-explorer`. Confirm: the resource list is grouped and searchable with real names; picking Pokémon then "Type" then "Grass" needs no typing of schema identifiers; the preview shows the compiled query; the grid fills.

**Report honestly what you verified and what you could not.** Do not claim manual verification you did not perform.

- [ ] **Step 5: Commit**

```bash
git add libs/ui-query-builder
git commit -m "test(query-builder): compose the query through pickers end to end"
```

---

## Execution Notes

- **Tasks 1 and 13's manual step need Hasura** at `http://localhost:8080/v1/graphql`. Everything else is offline.
- **Tasks 5, 6 and 7 are the authoring core.** 545 label entries plus ~20 curated resources. Their coverage tests define "done" and name exactly what is missing, so work from the failing output rather than counting by hand.
- **Task 5 and 6 are large but mechanical**; Task 7 is the one needing judgment.
- **The suite takes ~3 minutes.** Narrow with `--testPathPatterns=<name>` while iterating; run it unnarrowed before every commit.
- If a verified fact in this plan does not hold against the endpoint, **stop and report** rather than adapting the expectation. Those numbers came from measurement.
