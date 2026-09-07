# GraphQL Query Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A frontend query-builder component that compiles a user-composed filter tree into a GraphQL document plus variables for a Hasura-shaped endpoint.

**Architecture:** A new `libs/ui-query-builder` library with a hard seam between `core/` (framework-free model, lazy introspection catalog, and a two-phase compiler built on the `graphql` package's AST and `print()`) and `components/` (Angular UI on Signal Forms, session state in an `@ngrx/signals` store). The builder emits `{ document, variables }`; a `query-explorer` feature in `domain-pokedex` executes it and renders results in the existing AG Grid wrapper. No backend change.

**Tech Stack:** Angular 22 (standalone, OnPush, signal inputs, `@angular/forms/signals`), `@ngrx/signals` 21, `graphql` 16, Nx 23, Jest 30, `@ngneat/spectator`, AG Grid 36 (consumer only).

**Spec:** `docs/superpowers/specs/2026-09-06-graphql-query-builder-design.md` — read it before starting. Its "Validation" section contains the exact query this plan must reproduce.

## Global Constraints

- **Naming — no abbreviations. This is the first rule.** `context` never `ctx`, `pokedex` never `dex`, `operatorName` never `op`. Game-native terms (HP, PP, SP, STAB, IV, EV) are exempt. From `AGENTS.md`.
- **No comments.** No line comments, no block comments, no JSDoc. Name things instead. Machine-read directives (`// eslint-disable-next-line`, `// @ts-expect-error`) are exempt. Some existing files such as `libs/ui-pokedex/src/lib/chip-toggle/chip-toggle.component.ts` carry JSDoc predating this rule — **do not copy that style**.
- **Formatting:** tabs for indentation, single quotes, semicolons, trailing commas. Match surrounding files; Prettier config is at the workspace root.
- **Angular:** standalone components, `ChangeDetectionStrategy.OnPush`, `input()` / `output()` / `computed()`, `inject()` over constructor injection. One directory per component, named `<name>/<name>.component.ts`.
- **Never hardcode an API port or endpoint in the library.** The endpoint arrives through an injection token supplied by the consumer.
- **The builder library never imports AG Grid** and never imports from `domain-pokedex`.
- **Branch:** all work on `feat/graphql-query-builder`, already created. Never commit to `main`. Conventional commits, ending with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.
- **Target endpoint for manual verification:** `http://localhost:8080/v1/graphql` (the user's local Hasura PokeAPI). Tests never open a socket — they use committed fixtures and stub fetchers.
- **Resource naming is modern PokeAPI** (`pokemon`, `pokemonstats`, `pokemontypes`), **not** `pokemon_v2_*`. The root query field is singular (`pokemonstat`); the relation on `pokemon_bool_exp` is plural (`pokemonstats`). Both are correct.

## Verified Schema Facts

These were read off the live endpoint during design. Trust them over recall.

| Fact | Value |
|---|---|
| `_and` / `_or` | `[T_bool_exp]` (list) |
| `_not` | `T_bool_exp` (single) |
| Scalar field | `name: String_comparison_exp` |
| To-many relation | `pokemonstats: pokemonstat_bool_exp` **with** `pokemonstats_aggregate` sibling |
| To-one relation | `pokemonspecy: pokemonspecies_bool_exp` **without** an `_aggregate` sibling |
| `Int_comparison_exp` operators | `_eq _gt _gte _in _is_null _lt _lte _neq _nin` (9) |
| `String_comparison_exp` operators | the 9 above plus `_like _ilike _regex _iregex _similar _nlike _nilike _nregex _niregex _nsimilar` (19 total) |
| Root field args | `distinct_on`, `limit`, `offset`, `order_by`, `where` |
| Aggregate fields type | `pokemonstat_aggregate_fields` → `avg max min sum count stddev stddev_pop stddev_samp var_pop var_samp variance` |
| `pokemonstat_avg_fields` | numeric columns only, all `Float` |
| Order-by enum | `order_by`, used as `{ id: asc }` |

## File Structure

```
libs/ui-query-builder/
  src/index.ts                                            public barrel
  src/lib/core/model/query-tree.ts                        tree types + factories
  src/lib/core/model/literal-value.ts                     LiteralValue + coercion
  src/lib/core/dialect/query-builder-dialect.ts           dialect interface
  src/lib/core/dialect/hasura-dialect.ts                  the Hasura conventions
  src/lib/core/metadata/introspection-types.ts            minimal introspection shapes
  src/lib/core/metadata/read-boolean-expression.ts        bool_exp -> field descriptors
  src/lib/core/metadata/read-operators.ts                 comparison_exp -> operators
  src/lib/core/metadata/catalog.ts                        lazy cached catalog
  src/lib/core/metadata/__fixtures__/hasura-introspection.fixture.json
  src/lib/core/compiler/value-nodes.ts                    GraphQL ValueNode helpers
  src/lib/core/compiler/build-where.ts                    tree -> ObjectValueNode
  src/lib/core/compiler/collect-subqueries.ts             subquery discovery + naming
  src/lib/core/compiler/build-resolution-document.ts      phase one document
  src/lib/core/compiler/build-selection.ts                selection set
  src/lib/core/compiler/compile-query.ts                  phase two, public entry
  src/lib/overlay/query-builder-overlay.ts                overlay type + token
  src/lib/session/query-builder.store.ts                  @ngrx/signals store
  src/lib/components/<name>/<name>.component.ts           seven components
tools/query-builder/capture-introspection-fixture.mjs     fixture generator
libs/domain-pokedex/src/lib/features/query-explorer/      consumer feature
```

---

### Task 1: Scaffold the `ui-query-builder` library

**Files:**
- Create: `libs/ui-query-builder/**` (via generator)
- Modify: `tsconfig.base.json` (path alias, if the generator does not add it)

**Interfaces:**
- Consumes: nothing
- Produces: the `@pokemon-center/ui-query-builder` path alias and a working `pnpm nx test ui-query-builder` target.

- [ ] **Step 1: Generate the library**

```bash
pnpm nx g @nx/angular:library --name=ui-query-builder --directory=libs/ui-query-builder --prefix=pokedex --unitTestRunner=jest --style=css --standalone --skipModule --no-interactive
```

- [ ] **Step 2: Align the generated config with workspace convention**

Compare `libs/ui-query-builder/jest.config.ts` and `project.json` against `libs/ui-pokedex/`. The jest config must have `displayName: 'ui-query-builder'`, `preset: '../../jest.preset.js'`, `setupFilesAfterEach` pointing at `<rootDir>/src/test-setup.ts`, and `coverageDirectory: '../../coverage/libs/ui-query-builder'`. Reindent every generated file with tabs.

- [ ] **Step 3: Confirm the path alias exists**

Check `tsconfig.base.json` contains:

```json
"@pokemon-center/ui-query-builder": ["./libs/ui-query-builder/src/index.ts"],
```

Add it if the generator did not.

- [ ] **Step 4: Delete generator boilerplate**

Remove any generated sample component and empty its barrel. `src/index.ts` should be empty for now.

- [ ] **Step 5: Verify the test target runs**

Run: `pnpm nx test ui-query-builder`
Expected: PASS with zero test suites, or a "no tests found" success. It must not error on configuration.

- [ ] **Step 6: Commit**

```bash
git add libs/ui-query-builder tsconfig.base.json
git commit -m "feat(query-builder): scaffold the ui-query-builder library"
```

---

### Task 2: The query tree model

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/model/literal-value.ts`
- Create: `libs/ui-query-builder/src/lib/core/model/query-tree.ts`
- Test: `libs/ui-query-builder/src/lib/core/model/query-tree.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `LiteralValue`, `QueryBuilderNode`, `FilterGroup`, `FilterRule`, `RelationScope`, `FilterOperand`, `ScalarSubquery`, `ScalarSelector`, `FieldOrdering`, `AggregateFunctionName`, and the factories `createFilterGroup`, `createFilterRule`, `isFilterGroup`, `isFilterRule`.

- [ ] **Step 1: Write the failing test**

```ts
import { createFilterGroup, createFilterRule, isFilterGroup, isFilterRule } from './query-tree';

describe('query tree factories', () => {
	it('creates a group that defaults to AND, not negated and unscoped', () => {
		const group = createFilterGroup();

		expect(group.kind).toBe('group');
		expect(group.combinator).toBe('and');
		expect(group.negated).toBe(false);
		expect(group.relationScope).toBeNull();
		expect(group.children).toEqual([]);
	});

	it('gives every node a distinct identifier', () => {
		const first = createFilterGroup();
		const second = createFilterGroup();

		expect(first.nodeId).not.toBe(second.nodeId);
	});

	it('creates a rule carrying a literal operand', () => {
		const rule = createFilterRule({
			fieldPath: ['pokemontypes', 'type', 'name'],
			operatorName: '_eq',
			operand: { source: 'literal', value: 'grass' },
		});

		expect(rule.kind).toBe('rule');
		expect(rule.fieldPath).toEqual(['pokemontypes', 'type', 'name']);
		expect(rule.operand).toEqual({ source: 'literal', value: 'grass' });
	});

	it('narrows nodes by kind', () => {
		const group = createFilterGroup();
		const rule = createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'pikachu' } });

		expect(isFilterGroup(group)).toBe(true);
		expect(isFilterGroup(rule)).toBe(false);
		expect(isFilterRule(rule)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./query-tree`.

- [ ] **Step 3: Write `literal-value.ts`**

```ts
export type LiteralScalar = string | number | boolean | null;

export type LiteralValue = LiteralScalar | readonly LiteralScalar[];

export function coerceToGraphQLType(value: LiteralValue, typeName: string): LiteralValue {
	if (value === null || Array.isArray(value)) return value;

	if (typeName === 'Int' && typeof value === 'number') return Math.round(value);
	if (typeName === 'Float' && typeof value === 'number') return value;
	if (typeName === 'String' && typeof value !== 'string') return String(value);
	if (typeName === 'Boolean' && typeof value !== 'boolean') return Boolean(value);

	return value;
}
```

`Math.round` is the documented rule for Float-into-Int, and the spec requires the coerced value be **displayed** in the rule chip so the rounding is never invisible. Add these cases to the Task 2 test:

```ts
import { coerceToGraphQLType } from './literal-value';

describe('coerceToGraphQLType', () => {
	it('rounds a float average into an integer column', () => {
		expect(coerceToGraphQLType(72.4, 'Int')).toBe(72);
		expect(coerceToGraphQLType(72.6, 'Int')).toBe(73);
	});

	it('leaves a float alone for a float column', () => {
		expect(coerceToGraphQLType(72.4, 'Float')).toBe(72.4);
	});

	it('passes lists and nulls through untouched', () => {
		expect(coerceToGraphQLType(null, 'Int')).toBeNull();
		expect(coerceToGraphQLType(['a', 'b'], 'String')).toEqual(['a', 'b']);
	});
});
```

- [ ] **Step 4: Write `query-tree.ts`**

```ts
import type { LiteralValue } from './literal-value';

export type CombinatorName = 'and' | 'or';
export type RelationQuantifier = 'some' | 'none';
export type SortDirection = 'asc' | 'desc';
export type AggregateFunctionName = 'avg' | 'max' | 'min' | 'sum' | 'count' | 'stddev' | 'variance';

export interface FieldOrdering {
	readonly fieldPath: readonly string[];
	readonly direction: SortDirection;
}

export interface RelationScope {
	readonly fieldPath: readonly string[];
	readonly quantifier: RelationQuantifier;
}

export type ScalarSelector =
	| { readonly kind: 'row'; readonly fieldPath: readonly string[]; readonly ordering: FieldOrdering | null }
	| { readonly kind: 'aggregate'; readonly functionName: AggregateFunctionName; readonly fieldPath: readonly string[] };

export interface ScalarSubquery {
	readonly resourceName: string;
	readonly filter: FilterGroup | null;
	readonly selector: ScalarSelector;
}

export type FilterOperand =
	| { readonly source: 'literal'; readonly value: LiteralValue }
	| { readonly source: 'subquery'; readonly subquery: ScalarSubquery };

export interface FilterGroup {
	readonly kind: 'group';
	readonly nodeId: string;
	readonly combinator: CombinatorName;
	readonly negated: boolean;
	readonly relationScope: RelationScope | null;
	readonly children: readonly QueryBuilderNode[];
}

export interface FilterRule {
	readonly kind: 'rule';
	readonly nodeId: string;
	readonly fieldPath: readonly string[];
	readonly operatorName: string;
	readonly operand: FilterOperand;
}

export type QueryBuilderNode = FilterGroup | FilterRule;

let nodeCounter = 0;

function nextNodeId(prefix: string): string {
	nodeCounter += 1;
	return `${prefix}-${nodeCounter}`;
}

export function createFilterGroup(overrides: Partial<Omit<FilterGroup, 'kind' | 'nodeId'>> = {}): FilterGroup {
	return {
		kind: 'group',
		nodeId: nextNodeId('group'),
		combinator: overrides.combinator ?? 'and',
		negated: overrides.negated ?? false,
		relationScope: overrides.relationScope ?? null,
		children: overrides.children ?? [],
	};
}

export function createFilterRule(overrides: Partial<Omit<FilterRule, 'kind' | 'nodeId'>> = {}): FilterRule {
	return {
		kind: 'rule',
		nodeId: nextNodeId('rule'),
		fieldPath: overrides.fieldPath ?? [],
		operatorName: overrides.operatorName ?? '',
		operand: overrides.operand ?? { source: 'literal', value: null },
	};
}

export function isFilterGroup(node: QueryBuilderNode): node is FilterGroup {
	return node.kind === 'group';
}

export function isFilterRule(node: QueryBuilderNode): node is FilterRule {
	return node.kind === 'rule';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add libs/ui-query-builder/src/lib/core/model
git commit -m "feat(query-builder): add the query tree model and factories"
```

---

### Task 3: The Hasura dialect

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/dialect/query-builder-dialect.ts`
- Create: `libs/ui-query-builder/src/lib/core/dialect/hasura-dialect.ts`
- Test: `libs/ui-query-builder/src/lib/core/dialect/hasura-dialect.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `QueryBuilderDialect` interface and `hasuraDialect` constant.

- [ ] **Step 1: Write the failing test**

```ts
import { hasuraDialect } from './hasura-dialect';

describe('hasura dialect', () => {
	it('recognises the structural combinator fields', () => {
		expect(hasuraDialect.structuralFieldNames.has('_and')).toBe(true);
		expect(hasuraDialect.structuralFieldNames.has('_or')).toBe(true);
		expect(hasuraDialect.structuralFieldNames.has('_not')).toBe(true);
		expect(hasuraDialect.structuralFieldNames.has('name')).toBe(false);
	});

	it('recognises comparison expression type names', () => {
		expect(hasuraDialect.isComparisonTypeName('Int_comparison_exp')).toBe(true);
		expect(hasuraDialect.isComparisonTypeName('String_comparison_exp')).toBe(true);
		expect(hasuraDialect.isComparisonTypeName('pokemon_bool_exp')).toBe(false);
	});

	it('separates plain boolean expressions from aggregate ones', () => {
		expect(hasuraDialect.isBooleanExpressionTypeName('pokemon_bool_exp')).toBe(true);
		expect(hasuraDialect.isAggregateBooleanExpressionTypeName('pokemonmove_aggregate_bool_exp')).toBe(true);
		expect(hasuraDialect.isAggregateBooleanExpressionTypeName('pokemon_bool_exp')).toBe(false);
	});

	it('derives the aggregate sibling name used for the cardinality test', () => {
		expect(hasuraDialect.aggregateSiblingFieldName('pokemonstats')).toBe('pokemonstats_aggregate');
	});

	it('derives aggregate field type names for a resource', () => {
		expect(hasuraDialect.aggregateFieldsTypeName('pokemonstat', 'avg')).toBe('pokemonstat_avg_fields');
		expect(hasuraDialect.aggregateFieldsTypeName('pokemonstat', 'max')).toBe('pokemonstat_max_fields');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./hasura-dialect`.

- [ ] **Step 3: Write `query-builder-dialect.ts`**

```ts
import type { AggregateFunctionName } from '../model/query-tree';

export interface QueryBuilderDialect {
	readonly structuralFieldNames: ReadonlySet<string>;
	readonly combinatorFieldNames: Readonly<Record<'and' | 'or', string>>;
	readonly negationFieldName: string;
	isComparisonTypeName(typeName: string): boolean;
	isBooleanExpressionTypeName(typeName: string): boolean;
	isAggregateBooleanExpressionTypeName(typeName: string): boolean;
	aggregateSiblingFieldName(fieldName: string): string;
	aggregateFieldsTypeName(resourceName: string, functionName: AggregateFunctionName): string;
}
```

- [ ] **Step 4: Write `hasura-dialect.ts`**

```ts
import type { AggregateFunctionName } from '../model/query-tree';
import type { QueryBuilderDialect } from './query-builder-dialect';

const comparisonTypeSuffix = '_comparison_exp';
const booleanExpressionSuffix = '_bool_exp';
const aggregateBooleanExpressionSuffix = '_aggregate_bool_exp';

export const hasuraDialect: QueryBuilderDialect = {
	structuralFieldNames: new Set(['_and', '_or', '_not']),
	combinatorFieldNames: { and: '_and', or: '_or' },
	negationFieldName: '_not',
	isComparisonTypeName(typeName) {
		return typeName.endsWith(comparisonTypeSuffix);
	},
	isBooleanExpressionTypeName(typeName) {
		return typeName.endsWith(booleanExpressionSuffix);
	},
	isAggregateBooleanExpressionTypeName(typeName) {
		return typeName.endsWith(aggregateBooleanExpressionSuffix);
	},
	aggregateSiblingFieldName(fieldName) {
		return `${fieldName}_aggregate`;
	},
	aggregateFieldsTypeName(resourceName, functionName: AggregateFunctionName) {
		return `${resourceName}_${functionName}_fields`;
	},
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 5 new tests.

- [ ] **Step 6: Commit**

```bash
git add libs/ui-query-builder/src/lib/core/dialect
git commit -m "feat(query-builder): isolate the Hasura schema conventions behind a dialect"
```

---

### Task 4: Capture the introspection fixture

**Files:**
- Create: `tools/query-builder/capture-introspection-fixture.mjs`
- Create: `libs/ui-query-builder/src/lib/core/metadata/__fixtures__/hasura-introspection.fixture.json`

**Interfaces:**
- Consumes: nothing
- Produces: a committed JSON fixture shaped `{ "<typeName>": { "name": string, "kind": string, "inputFields": [...] } }`, used by every catalog test.

This task requires the user's Hasura running at `http://localhost:8080/v1/graphql`. It is the only task that touches the network.

- [ ] **Step 1: Write the capture script**

```js
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
```

- [ ] **Step 2: Run it**

```bash
node tools/query-builder/capture-introspection-fixture.mjs http://localhost:8080/v1/graphql libs/ui-query-builder/src/lib/core/metadata/__fixtures__/hasura-introspection.fixture.json
```

Expected: 13 "captured" lines. `pokemon_bool_exp` must report **42** input fields and `Int_comparison_exp` must report **9**. If those two numbers differ, stop — the endpoint is not the schema this plan was written against, and Task 5's expectations will not hold.

- [ ] **Step 3: Sanity-check the fixture by eye**

Confirm `pokemon_bool_exp` contains both `pokemonstats` and `pokemonstats_aggregate`, and contains `pokemonspecy` **without** a `pokemonspecy_aggregate`. This pairing is the cardinality rule Task 5 implements.

- [ ] **Step 4: Commit**

```bash
git add tools/query-builder libs/ui-query-builder/src/lib/core/metadata/__fixtures__
git commit -m "chore(query-builder): capture a trimmed Hasura introspection fixture"
```

---

### Task 5: Read a boolean expression into field descriptors

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/metadata/introspection-types.ts`
- Create: `libs/ui-query-builder/src/lib/core/metadata/read-boolean-expression.ts`
- Test: `libs/ui-query-builder/src/lib/core/metadata/read-boolean-expression.spec.ts`

**Interfaces:**
- Consumes: `hasuraDialect` (Task 3), the fixture (Task 4)
- Produces: `IntrospectionTypeReference`, `IntrospectionInputField`, `IntrospectionInputObject`, `CatalogFieldDescriptor` (union of `ScalarFieldDescriptor` | `RelationFieldDescriptor` | `AggregatePredicateDescriptor`), `unwrapTypeName`, `readBooleanExpression(inputObject, dialect)`.

- [ ] **Step 1: Write the failing test**

```ts
import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { readBooleanExpression } from './read-boolean-expression';
import type { IntrospectionInputObject } from './introspection-types';

const pokemonBooleanExpression = fixture['pokemon_bool_exp'] as IntrospectionInputObject;

describe('readBooleanExpression', () => {
	const descriptors = readBooleanExpression(pokemonBooleanExpression, hasuraDialect);
	const byName = new Map(descriptors.map((descriptor) => [descriptor.fieldName, descriptor]));

	it('drops the structural combinator fields', () => {
		expect(byName.has('_and')).toBe(false);
		expect(byName.has('_or')).toBe(false);
		expect(byName.has('_not')).toBe(false);
	});

	it('classifies a comparison field as a scalar carrying its comparison type', () => {
		expect(byName.get('name')).toEqual({ kind: 'scalar', fieldName: 'name', comparisonTypeName: 'String_comparison_exp' });
		expect(byName.get('height')).toEqual({ kind: 'scalar', fieldName: 'height', comparisonTypeName: 'Int_comparison_exp' });
	});

	it('classifies a relation with an aggregate sibling as to-many', () => {
		expect(byName.get('pokemonstats')).toEqual({
			kind: 'relation',
			fieldName: 'pokemonstats',
			booleanExpressionTypeName: 'pokemonstat_bool_exp',
			cardinality: 'toMany',
		});
	});

	it('classifies a relation without an aggregate sibling as to-one', () => {
		expect(byName.get('pokemonspecy')).toEqual({
			kind: 'relation',
			fieldName: 'pokemonspecy',
			booleanExpressionTypeName: 'pokemonspecies_bool_exp',
			cardinality: 'toOne',
		});
	});

	it('keeps aggregate predicates as their own kind', () => {
		expect(byName.get('pokemonmoves_aggregate')).toEqual({
			kind: 'aggregatePredicate',
			fieldName: 'pokemonmoves_aggregate',
			booleanExpressionTypeName: 'pokemonmove_aggregate_bool_exp',
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./read-boolean-expression`.

- [ ] **Step 3: Enable JSON imports if needed**

If the test fails on importing JSON, add `"resolveJsonModule": true` to `libs/ui-query-builder/tsconfig.lib.json` and `tsconfig.spec.json` compiler options.

- [ ] **Step 4: Write `introspection-types.ts`**

```ts
export interface IntrospectionTypeReference {
	readonly kind: string;
	readonly name: string | null;
	readonly ofType?: IntrospectionTypeReference | null;
}

export interface IntrospectionInputField {
	readonly name: string;
	readonly type: IntrospectionTypeReference;
}

export interface IntrospectionInputObject {
	readonly name: string;
	readonly kind: string;
	readonly inputFields: readonly IntrospectionInputField[];
}

export interface ScalarFieldDescriptor {
	readonly kind: 'scalar';
	readonly fieldName: string;
	readonly comparisonTypeName: string;
}

export interface RelationFieldDescriptor {
	readonly kind: 'relation';
	readonly fieldName: string;
	readonly booleanExpressionTypeName: string;
	readonly cardinality: 'toOne' | 'toMany';
}

export interface AggregatePredicateDescriptor {
	readonly kind: 'aggregatePredicate';
	readonly fieldName: string;
	readonly booleanExpressionTypeName: string;
}

export type CatalogFieldDescriptor = ScalarFieldDescriptor | RelationFieldDescriptor | AggregatePredicateDescriptor;
```

- [ ] **Step 5: Write `read-boolean-expression.ts`**

```ts
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { CatalogFieldDescriptor, IntrospectionInputObject, IntrospectionTypeReference } from './introspection-types';

export function unwrapTypeName(typeReference: IntrospectionTypeReference): string {
	let current: IntrospectionTypeReference = typeReference;
	while (current.ofType) {
		current = current.ofType;
	}
	return current.name ?? '';
}

export function readBooleanExpression(inputObject: IntrospectionInputObject, dialect: QueryBuilderDialect): readonly CatalogFieldDescriptor[] {
	const presentFieldNames = new Set(inputObject.inputFields.map((inputField) => inputField.name));
	const descriptors: CatalogFieldDescriptor[] = [];

	for (const inputField of inputObject.inputFields) {
		if (dialect.structuralFieldNames.has(inputField.name)) continue;

		const typeName = unwrapTypeName(inputField.type);

		if (dialect.isComparisonTypeName(typeName)) {
			descriptors.push({ kind: 'scalar', fieldName: inputField.name, comparisonTypeName: typeName });
			continue;
		}

		if (dialect.isAggregateBooleanExpressionTypeName(typeName)) {
			descriptors.push({ kind: 'aggregatePredicate', fieldName: inputField.name, booleanExpressionTypeName: typeName });
			continue;
		}

		if (dialect.isBooleanExpressionTypeName(typeName)) {
			const hasAggregateSibling = presentFieldNames.has(dialect.aggregateSiblingFieldName(inputField.name));
			descriptors.push({
				kind: 'relation',
				fieldName: inputField.name,
				booleanExpressionTypeName: typeName,
				cardinality: hasAggregateSibling ? 'toMany' : 'toOne',
			});
		}
	}

	return descriptors;
}
```

Note the ordering: the aggregate check must run **before** the plain boolean-expression check, because `pokemonmove_aggregate_bool_exp` also ends with `_bool_exp`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 5 new tests.

- [ ] **Step 7: Commit**

```bash
git add libs/ui-query-builder/src/lib/core/metadata
git commit -m "feat(query-builder): classify boolean expression fields into catalog descriptors"
```

---

### Task 6: Read the operator list, and the lazy catalog

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/metadata/read-operators.ts`
- Create: `libs/ui-query-builder/src/lib/core/metadata/catalog.ts`
- Test: `libs/ui-query-builder/src/lib/core/metadata/read-operators.spec.ts`
- Test: `libs/ui-query-builder/src/lib/core/metadata/catalog.spec.ts`

**Interfaces:**
- Consumes: Tasks 3 and 5
- Produces: `readOperators(inputObject)`, `OperatorDescriptor`, `IntrospectionFetcher` type, `createQueryBuilderCatalog(fetcher, dialect)` returning `{ readBooleanExpressionFields, readOperatorsForComparisonType, fetchCount }`.

- [ ] **Step 1: Write the failing operator test**

```ts
import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { readOperators } from './read-operators';
import type { IntrospectionInputObject } from './introspection-types';

describe('readOperators', () => {
	it('reads the nine integer operators with their argument shapes', () => {
		const operators = readOperators(fixture['Int_comparison_exp'] as IntrospectionInputObject);
		const names = operators.map((operator) => operator.operatorName);

		expect(names).toEqual(['_eq', '_gt', '_gte', '_in', '_is_null', '_lt', '_lte', '_neq', '_nin']);
		expect(operators.find((operator) => operator.operatorName === '_in')?.acceptsList).toBe(true);
		expect(operators.find((operator) => operator.operatorName === '_eq')?.acceptsList).toBe(false);
		expect(operators.find((operator) => operator.operatorName === '_eq')?.argumentTypeName).toBe('Int');
		expect(operators.find((operator) => operator.operatorName === '_is_null')?.argumentTypeName).toBe('Boolean');
	});

	it('reads the larger string operator set including pattern matching', () => {
		const operators = readOperators(fixture['String_comparison_exp'] as IntrospectionInputObject);
		const names = operators.map((operator) => operator.operatorName);

		expect(names).toHaveLength(19);
		expect(names).toContain('_ilike');
		expect(names).toContain('_regex');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./read-operators`.

- [ ] **Step 3: Write `read-operators.ts`**

```ts
import type { IntrospectionInputObject, IntrospectionTypeReference } from './introspection-types';
import { unwrapTypeName } from './read-boolean-expression';

export interface OperatorDescriptor {
	readonly operatorName: string;
	readonly argumentTypeName: string;
	readonly acceptsList: boolean;
}

function containsList(typeReference: IntrospectionTypeReference): boolean {
	let current: IntrospectionTypeReference | null | undefined = typeReference;
	while (current) {
		if (current.kind === 'LIST') return true;
		current = current.ofType;
	}
	return false;
}

export function readOperators(inputObject: IntrospectionInputObject): readonly OperatorDescriptor[] {
	return inputObject.inputFields.map((inputField) => ({
		operatorName: inputField.name,
		argumentTypeName: unwrapTypeName(inputField.type),
		acceptsList: containsList(inputField.type),
	}));
}
```

- [ ] **Step 4: Run the operator test**

Run: `pnpm nx test ui-query-builder`
Expected: PASS.

- [ ] **Step 5: Write the failing catalog test**

```ts
import fixture from './__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createQueryBuilderCatalog } from './catalog';
import type { IntrospectionInputObject } from './introspection-types';

function createStubFetcher() {
	const requestedTypeNames: string[] = [];
	const fetcher = async (typeName: string): Promise<IntrospectionInputObject | null> => {
		requestedTypeNames.push(typeName);
		return (fixture as Record<string, IntrospectionInputObject>)[typeName] ?? null;
	};
	return { fetcher, requestedTypeNames };
}

describe('query builder catalog', () => {
	it('returns descriptors for a boolean expression type', async () => {
		const { fetcher } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		const descriptors = await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(descriptors.some((descriptor) => descriptor.fieldName === 'pokemonstats')).toBe(true);
	});

	it('fetches each type at most once', async () => {
		const { fetcher, requestedTypeNames } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		await catalog.readBooleanExpressionFields('pokemon_bool_exp');
		await catalog.readBooleanExpressionFields('pokemon_bool_exp');

		expect(requestedTypeNames).toEqual(['pokemon_bool_exp']);
	});

	it('shares one fetch across every field of the same comparison type', async () => {
		const { fetcher, requestedTypeNames } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		await catalog.readOperatorsForComparisonType('Int_comparison_exp');
		await catalog.readOperatorsForComparisonType('Int_comparison_exp');

		expect(requestedTypeNames).toEqual(['Int_comparison_exp']);
	});

	it('returns an empty descriptor list for a type the endpoint does not know', async () => {
		const { fetcher } = createStubFetcher();
		const catalog = createQueryBuilderCatalog(fetcher, hasuraDialect);

		await expect(catalog.readBooleanExpressionFields('nonexistent_bool_exp')).resolves.toEqual([]);
	});
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./catalog`.

- [ ] **Step 7: Write `catalog.ts`**

```ts
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { CatalogFieldDescriptor, IntrospectionInputObject } from './introspection-types';
import { readBooleanExpression } from './read-boolean-expression';
import { readOperators, type OperatorDescriptor } from './read-operators';

export type IntrospectionFetcher = (typeName: string) => Promise<IntrospectionInputObject | null>;

export interface QueryBuilderCatalog {
	readBooleanExpressionFields(typeName: string): Promise<readonly CatalogFieldDescriptor[]>;
	readOperatorsForComparisonType(typeName: string): Promise<readonly OperatorDescriptor[]>;
}

export function createQueryBuilderCatalog(fetcher: IntrospectionFetcher, dialect: QueryBuilderDialect): QueryBuilderCatalog {
	const pendingByTypeName = new Map<string, Promise<IntrospectionInputObject | null>>();

	function fetchOnce(typeName: string): Promise<IntrospectionInputObject | null> {
		const pending = pendingByTypeName.get(typeName);
		if (pending) return pending;

		const started = fetcher(typeName);
		pendingByTypeName.set(typeName, started);
		return started;
	}

	return {
		async readBooleanExpressionFields(typeName) {
			const inputObject = await fetchOnce(typeName);
			return inputObject ? readBooleanExpression(inputObject, dialect) : [];
		},
		async readOperatorsForComparisonType(typeName) {
			const inputObject = await fetchOnce(typeName);
			return inputObject ? readOperators(inputObject) : [];
		},
	};
}
```

Caching the **promise** rather than the result is deliberate: two concurrent drills into the same type must share one request, not race.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 6 new tests.

- [ ] **Step 9: Commit**

```bash
git add libs/ui-query-builder/src/lib/core/metadata
git commit -m "feat(query-builder): add operator reading and the lazily cached catalog"
```

---

### Task 7: GraphQL value nodes and the where builder

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/compiler/value-nodes.ts`
- Create: `libs/ui-query-builder/src/lib/core/compiler/build-where.ts`
- Test: `libs/ui-query-builder/src/lib/core/compiler/build-where.spec.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3
- Produces: `literalValueNode`, `variableValueNode`, `objectValueNode`, `listValueNode`, `enumValueNode`, and `buildWhereValueNode(group, dialect, variableNameByNodeId)` returning an `ObjectValueNode`.

- [ ] **Step 1: Write the failing test**

```ts
import { print } from 'graphql';
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule } from '../model/query-tree';
import { buildWhereValueNode } from './build-where';

function printWhere(group: Parameters<typeof buildWhereValueNode>[0], variableNameByNodeId = new Map<string, string>()) {
	return print(buildWhereValueNode(group, hasuraDialect, variableNameByNodeId)).replace(/\s+/g, ' ');
}

describe('buildWhereValueNode', () => {
	it('nests a rule along its field path', () => {
		const group = createFilterGroup({
			children: [
				createFilterRule({
					fieldPath: ['pokemontypes', 'type', 'name'],
					operatorName: '_eq',
					operand: { source: 'literal', value: 'grass' },
				}),
			],
		});

		expect(printWhere(group)).toBe('{ _and: [{ pokemontypes: { type: { name: { _eq: "grass" } } } }] }');
	});

	it('uses the or combinator when the group asks for it', () => {
		const group = createFilterGroup({
			combinator: 'or',
			children: [
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'pikachu' } }),
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'raichu' } }),
			],
		});

		expect(printWhere(group)).toBe('{ _or: [{ name: { _eq: "pikachu" } }, { name: { _eq: "raichu" } }] }');
	});

	it('wraps a negated group in _not', () => {
		const group = createFilterGroup({
			negated: true,
			children: [createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'ditto' } })],
		});

		expect(printWhere(group)).toBe('{ _not: { _and: [{ name: { _eq: "ditto" } }] } }');
	});

	it('compiles a relation-scoped group so its children share one related row', () => {
		const group = createFilterGroup({
			relationScope: { fieldPath: ['pokemonstats'], quantifier: 'some' },
			children: [
				createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
				createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'literal', value: 30 } }),
			],
		});

		expect(printWhere(group)).toBe('{ pokemonstats: { _and: [{ stat: { name: { _eq: "speed" } } }, { base_stat: { _gt: 30 } }] } }');
	});

	it('compiles a none-quantified relation scope as a negated relation', () => {
		const group = createFilterGroup({
			relationScope: { fieldPath: ['pokemonmoves'], quantifier: 'none' },
			children: [createFilterRule({ fieldPath: ['move', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'splash' } })],
		});

		expect(printWhere(group)).toBe('{ _not: { pokemonmoves: { _and: [{ move: { name: { _eq: "splash" } } }] } } }');
	});

	it('emits a list value for list operators', () => {
		const group = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['name'], operatorName: '_in', operand: { source: 'literal', value: ['grass', 'fire'] } })],
		});

		expect(printWhere(group)).toBe('{ _and: [{ name: { _in: ["grass", "fire"] } }] }');
	});

	it('emits a variable reference for a subquery operand', () => {
		const rule = createFilterRule({
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: { resourceName: 'pokemonstat', filter: null, selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null } },
			},
		});
		const group = createFilterGroup({ children: [rule] });

		expect(printWhere(group, new Map([[rule.nodeId, 'snorlaxSpeed']]))).toBe('{ _and: [{ base_stat: { _gt: $snorlaxSpeed } }] }');
	});

	it('drops an empty group so a blank builder does not emit a broken filter', () => {
		expect(printWhere(createFilterGroup())).toBe('{}');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./build-where`.

- [ ] **Step 3: Write `value-nodes.ts`**

```ts
import { Kind, type ListValueNode, type ObjectValueNode, type ValueNode, type VariableNode } from 'graphql';
import type { LiteralScalar, LiteralValue } from '../model/literal-value';

function scalarValueNode(value: LiteralScalar): ValueNode {
	if (value === null) return { kind: Kind.NULL };
	if (typeof value === 'boolean') return { kind: Kind.BOOLEAN, value };
	if (typeof value === 'number') {
		return Number.isInteger(value) ? { kind: Kind.INT, value: String(value) } : { kind: Kind.FLOAT, value: String(value) };
	}
	return { kind: Kind.STRING, value };
}

export function literalValueNode(value: LiteralValue): ValueNode {
	if (Array.isArray(value)) {
		return { kind: Kind.LIST, values: value.map(scalarValueNode) };
	}
	return scalarValueNode(value as LiteralScalar);
}

export function variableValueNode(variableName: string): VariableNode {
	return { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: variableName } };
}

export function enumValueNode(value: string): ValueNode {
	return { kind: Kind.ENUM, value };
}

export function objectValueNode(fields: readonly (readonly [string, ValueNode])[]): ObjectValueNode {
	return {
		kind: Kind.OBJECT,
		fields: fields.map(([fieldName, value]) => ({
			kind: Kind.OBJECT_FIELD,
			name: { kind: Kind.NAME, value: fieldName },
			value,
		})),
	};
}

export function listValueNode(values: readonly ValueNode[]): ListValueNode {
	return { kind: Kind.LIST, values: [...values] };
}
```

`literalValueNode` is why we use the AST: `"grass"` becomes a `STRING` node and `$snorlaxSpeed` a `VARIABLE` node, so `print()` quotes exactly one of them. String concatenation gets this wrong eventually.

- [ ] **Step 4: Write `build-where.ts`**

```ts
import type { ObjectValueNode, ValueNode } from 'graphql';
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import { isFilterGroup, type FilterGroup, type FilterRule, type QueryBuilderNode } from '../model/query-tree';
import { literalValueNode, listValueNode, objectValueNode, variableValueNode } from './value-nodes';

export type VariableNameByNodeId = ReadonlyMap<string, string>;

function nestAlongPath(fieldPath: readonly string[], leaf: ValueNode): ValueNode {
	return fieldPath.reduceRight<ValueNode>((accumulated, fieldName) => objectValueNode([[fieldName, accumulated]]), leaf);
}

function buildRuleValueNode(rule: FilterRule, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode | null {
	if (rule.fieldPath.length === 0 || rule.operatorName === '') return null;

	let operandNode: ValueNode;
	if (rule.operand.source === 'subquery') {
		const variableName = variableNameByNodeId.get(rule.nodeId);
		if (!variableName) return null;
		operandNode = variableValueNode(variableName);
	} else {
		operandNode = literalValueNode(rule.operand.value);
	}

	const comparison = objectValueNode([[rule.operatorName, operandNode]]);
	return nestAlongPath(rule.fieldPath, comparison) as ObjectValueNode;
}

function buildNodeValueNode(node: QueryBuilderNode, dialect: QueryBuilderDialect, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode | null {
	return isFilterGroup(node) ? buildGroupValueNode(node, dialect, variableNameByNodeId) : buildRuleValueNode(node, variableNameByNodeId);
}

function buildGroupValueNode(group: FilterGroup, dialect: QueryBuilderDialect, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode | null {
	const childNodes = group.children
		.map((child) => buildNodeValueNode(child, dialect, variableNameByNodeId))
		.filter((child): child is ObjectValueNode => child !== null);

	if (childNodes.length === 0) return null;

	const combinatorFieldName = dialect.combinatorFieldNames[group.combinator];
	let result: ObjectValueNode = objectValueNode([[combinatorFieldName, listValueNode(childNodes)]]);

	if (group.relationScope) {
		result = nestAlongPath(group.relationScope.fieldPath, result) as ObjectValueNode;
		if (group.relationScope.quantifier === 'none') {
			result = objectValueNode([[dialect.negationFieldName, result]]);
		}
	}

	if (group.negated) {
		result = objectValueNode([[dialect.negationFieldName, result]]);
	}

	return result;
}

export function buildWhereValueNode(group: FilterGroup, dialect: QueryBuilderDialect, variableNameByNodeId: VariableNameByNodeId): ObjectValueNode {
	return buildGroupValueNode(group, dialect, variableNameByNodeId) ?? objectValueNode([]);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 8 new tests.

- [ ] **Step 6: Commit**

```bash
git add libs/ui-query-builder/src/lib/core/compiler
git commit -m "feat(query-builder): build the where clause as a GraphQL value AST"
```

---

### Task 8: Collect subqueries and build the resolution document

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/compiler/collect-subqueries.ts`
- Create: `libs/ui-query-builder/src/lib/core/compiler/build-resolution-document.ts`
- Test: `libs/ui-query-builder/src/lib/core/compiler/collect-subqueries.spec.ts`
- Test: `libs/ui-query-builder/src/lib/core/compiler/build-resolution-document.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 7
- Produces: `CollectedSubquery { variableName, nodeIds, subquery }`, `collectSubqueries(group)`, `buildResolutionDocument(collected, dialect)` returning a printed document string.

The resolution document this task produces must match the shape validated in the spec.

- [ ] **Step 1: Write the failing collection test**

```ts
import { createFilterGroup, createFilterRule, type ScalarSubquery } from '../model/query-tree';
import { collectSubqueries } from './collect-subqueries';

const snorlaxSpeed: ScalarSubquery = {
	resourceName: 'pokemonstat',
	filter: createFilterGroup({
		children: [
			createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
			createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
		],
	}),
	selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
};

describe('collectSubqueries', () => {
	it('finds a subquery operand and names its variable from resource and field', () => {
		const rule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const collected = collectSubqueries(createFilterGroup({ children: [rule] }));

		expect(collected).toHaveLength(1);
		expect(collected[0].variableName).toBe('pokemonstatBaseStat1');
		expect(collected[0].nodeIds).toEqual([rule.nodeId]);
	});

	it('deduplicates structurally identical subqueries onto one variable', () => {
		const first = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const second = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_lt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const collected = collectSubqueries(createFilterGroup({ children: [first, second] }));

		expect(collected).toHaveLength(1);
		expect(collected[0].nodeIds).toEqual([first.nodeId, second.nodeId]);
	});

	it('descends into nested groups', () => {
		const rule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });
		const collected = collectSubqueries(createFilterGroup({ children: [createFilterGroup({ children: [rule] })] }));

		expect(collected).toHaveLength(1);
	});

	it('returns nothing for a tree of literal operands', () => {
		const group = createFilterGroup({
			children: [createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } })],
		});

		expect(collectSubqueries(group)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./collect-subqueries`.

- [ ] **Step 3: Write `collect-subqueries.ts`**

```ts
import { isFilterGroup, type FilterGroup, type QueryBuilderNode, type ScalarSubquery } from '../model/query-tree';

export interface CollectedSubquery {
	readonly variableName: string;
	readonly nodeIds: readonly string[];
	readonly subquery: ScalarSubquery;
}

function toPascalCase(value: string): string {
	return value
		.split(/[^a-zA-Z0-9]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function selectorSuffix(subquery: ScalarSubquery): string {
	if (subquery.selector.kind === 'aggregate') {
		return `${toPascalCase(subquery.selector.functionName)}${subquery.selector.fieldPath.map(toPascalCase).join('')}`;
	}
	return subquery.selector.fieldPath.map(toPascalCase).join('');
}

function identityOf(subquery: ScalarSubquery): string {
	return JSON.stringify(subquery, (key, value) => (key === 'nodeId' ? undefined : value));
}

export function collectSubqueries(group: FilterGroup): readonly CollectedSubquery[] {
	const byIdentity = new Map<string, { variableName: string; nodeIds: string[]; subquery: ScalarSubquery }>();

	function visit(node: QueryBuilderNode): void {
		if (isFilterGroup(node)) {
			node.children.forEach(visit);
			return;
		}
		if (node.operand.source !== 'subquery') return;

		const subquery = node.operand.subquery;
		const identity = identityOf(subquery);
		const existing = byIdentity.get(identity);

		if (existing) {
			existing.nodeIds.push(node.nodeId);
			return;
		}

		const variableName = `${subquery.resourceName}${selectorSuffix(subquery)}${byIdentity.size + 1}`;
		byIdentity.set(identity, { variableName, nodeIds: [node.nodeId], subquery });
	}

	visit(group);

	return [...byIdentity.values()];
}
```

The `nodeId` key is stripped from the identity so two subqueries that differ only by the identifiers of their internal filter nodes still deduplicate.

- [ ] **Step 4: Run the collection test**

Run: `pnpm nx test ui-query-builder`
Expected: PASS.

- [ ] **Step 5: Write the failing resolution-document test**

```ts
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule } from '../model/query-tree';
import { buildResolutionDocument } from './build-resolution-document';
import { collectSubqueries } from './collect-subqueries';

describe('buildResolutionDocument', () => {
	it('produces one alias per subquery, ordered and limited to a single row', () => {
		const rule = createFilterRule({
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: {
					resourceName: 'pokemonstat',
					filter: createFilterGroup({
						children: [
							createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
							createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
						],
					}),
					selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
				},
			},
		});

		const document = buildResolutionDocument(collectSubqueries(createFilterGroup({ children: [rule] })), hasuraDialect);

		expect(document.replace(/\s+/g, ' ')).toContain(
			'pokemonstatBaseStat1: pokemonstat(where: { _and: [{ pokemon: { name: { _eq: "snorlax" } } }, { stat: { name: { _eq: "speed" } } }] }, order_by: { id: asc }, limit: 1) { base_stat }',
		);
	});

	it('produces an aggregate selection for an aggregate selector', () => {
		const rule = createFilterRule({
			fieldPath: ['base_stat'],
			operatorName: '_gt',
			operand: {
				source: 'subquery',
				subquery: {
					resourceName: 'pokemonstat',
					filter: null,
					selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['base_stat'] },
				},
			},
		});

		const document = buildResolutionDocument(collectSubqueries(createFilterGroup({ children: [rule] })), hasuraDialect);

		expect(document.replace(/\s+/g, ' ')).toContain('pokemonstatAvgBaseStat1: pokemonstat_aggregate { aggregate { avg { base_stat } } }');
	});

	it('returns an empty string when there is nothing to resolve', () => {
		expect(buildResolutionDocument([], hasuraDialect)).toBe('');
	});
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./build-resolution-document`.

- [ ] **Step 7: Write `build-resolution-document.ts`**

```ts
import { Kind, print, type ArgumentNode, type FieldNode, type SelectionSetNode, type ValueNode } from 'graphql';
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { FieldOrdering, ScalarSubquery } from '../model/query-tree';
import { buildWhereValueNode } from './build-where';
import type { CollectedSubquery } from './collect-subqueries';
import { enumValueNode, literalValueNode, objectValueNode } from './value-nodes';

const defaultOrdering: FieldOrdering = { fieldPath: ['id'], direction: 'asc' };

function nameNode(value: string) {
	return { kind: Kind.NAME, value } as const;
}

function fieldNode(fieldName: string, selections: readonly FieldNode[] = [], alias?: string, argumentNodes: readonly ArgumentNode[] = []): FieldNode {
	return {
		kind: Kind.FIELD,
		name: nameNode(fieldName),
		...(alias ? { alias: nameNode(alias) } : {}),
		...(argumentNodes.length > 0 ? { arguments: [...argumentNodes] } : {}),
		...(selections.length > 0 ? { selectionSet: { kind: Kind.SELECTION_SET, selections: [...selections] } as SelectionSetNode } : {}),
	};
}

function argumentNode(argumentName: string, value: ValueNode): ArgumentNode {
	return { kind: Kind.ARGUMENT, name: nameNode(argumentName), value };
}

function nestSelection(fieldPath: readonly string[]): FieldNode {
	const [head, ...rest] = fieldPath;
	return rest.length === 0 ? fieldNode(head) : fieldNode(head, [nestSelection(rest)]);
}

function orderingValueNode(ordering: FieldOrdering) {
	return ordering.fieldPath.reduceRight<ReturnType<typeof objectValueNode> | ReturnType<typeof enumValueNode>>(
		(accumulated, fieldName) => objectValueNode([[fieldName, accumulated]]),
		enumValueNode(ordering.direction),
	);
}

function buildSubqueryField(collected: CollectedSubquery, dialect: QueryBuilderDialect): FieldNode {
	const { subquery, variableName } = collected;
	const argumentNodes: ArgumentNode[] = [];

	if (subquery.filter) {
		argumentNodes.push(argumentNode('where', buildWhereValueNode(subquery.filter, dialect, new Map())));
	}

	if (subquery.selector.kind === 'aggregate') {
		const aggregateSelection =
			subquery.selector.functionName === 'count'
				? fieldNode('count')
				: fieldNode(subquery.selector.functionName, [nestSelection(subquery.selector.fieldPath)]);

		return fieldNode(`${subquery.resourceName}_aggregate`, [fieldNode('aggregate', [aggregateSelection])], variableName, argumentNodes);
	}

	const ordering = subquery.selector.ordering ?? defaultOrdering;
	argumentNodes.push(argumentNode('order_by', orderingValueNode(ordering)));
	argumentNodes.push(argumentNode('limit', literalValueNode(1)));

	return fieldNode(subquery.resourceName, [nestSelection(subquery.selector.fieldPath)], variableName, argumentNodes);
}

export function buildResolutionDocument(collected: readonly CollectedSubquery[], dialect: QueryBuilderDialect): string {
	if (collected.length === 0) return '';

	return print({
		kind: Kind.DOCUMENT,
		definitions: [
			{
				kind: Kind.OPERATION_DEFINITION,
				operation: 'query' as const,
				name: nameNode('ResolveOperands'),
				selectionSet: {
					kind: Kind.SELECTION_SET,
					selections: collected.map((entry) => buildSubqueryField(entry, dialect)),
				},
			},
		],
	});
}
```

If TypeScript complains about the `argumentNode` value parameter type, simplify its signature to `(argumentName: string, value: ValueNode): ArgumentNode` importing `ValueNode` from `graphql`.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 7 new tests.

- [ ] **Step 9: Commit**

```bash
git add libs/ui-query-builder/src/lib/core/compiler
git commit -m "feat(query-builder): collect subquery operands and build the resolution document"
```

---

### Task 9: `compileQuery` — the public compiler entry point

**Files:**
- Create: `libs/ui-query-builder/src/lib/core/compiler/build-selection.ts`
- Create: `libs/ui-query-builder/src/lib/core/compiler/compile-query.ts`
- Test: `libs/ui-query-builder/src/lib/core/compiler/compile-query.spec.ts`
- Modify: `libs/ui-query-builder/src/index.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 7, 8
- Produces: `SelectionNode`, `CompileRequest`, `CompileResult`, `CompileIssue`, `compileQuery(request, dialect)`.

**This task reproduces the spec's validated query. That test is the contract.**

- [ ] **Step 1: Write the failing test**

```ts
import { hasuraDialect } from '../dialect/hasura-dialect';
import { createFilterGroup, createFilterRule, type ScalarSubquery } from '../model/query-tree';
import { compileQuery } from './compile-query';

const snorlaxSpeed: ScalarSubquery = {
	resourceName: 'pokemonstat',
	filter: createFilterGroup({
		children: [
			createFilterRule({ fieldPath: ['pokemon', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'snorlax' } }),
			createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
		],
	}),
	selector: { kind: 'row', fieldPath: ['base_stat'], ordering: null },
};

function buildHeadlineRequest() {
	const speedRule = createFilterRule({ fieldPath: ['base_stat'], operatorName: '_gt', operand: { source: 'subquery', subquery: snorlaxSpeed } });

	return {
		resourceName: 'pokemon',
		filter: createFilterGroup({
			children: [
				createFilterRule({ fieldPath: ['pokemontypes', 'type', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } }),
				createFilterRule({
					fieldPath: ['pokemonabilities', 'ability', 'name'],
					operatorName: '_eq',
					operand: { source: 'literal', value: 'overgrow' },
				}),
				createFilterRule({ fieldPath: ['pokemonmoves', 'move', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'razor-leaf' } }),
				createFilterGroup({
					relationScope: { fieldPath: ['pokemonstats'], quantifier: 'some' as const },
					children: [
						createFilterRule({ fieldPath: ['stat', 'name'], operatorName: '_eq', operand: { source: 'literal', value: 'speed' } }),
						speedRule,
					],
				}),
			],
		}),
		selection: { fieldName: '', children: [{ fieldName: 'id', children: [] }, { fieldName: 'name', children: [] }] },
		ordering: [{ fieldPath: ['id'], direction: 'asc' as const }],
		limit: 20,
		resolvedValues: new Map<string, number>([['pokemonstatBaseStat1', 30]]),
		variableTypeNames: new Map<string, string>([['pokemonstatBaseStat1', 'Int']]),
	};
}

describe('compileQuery', () => {
	it('compiles the validated headline query', () => {
		const result = compileQuery(buildHeadlineRequest(), hasuraDialect);

		expect(result.status).toBe('complete');
		if (result.status !== 'complete') return;

		const normalised = result.document.replace(/\s+/g, ' ');
		expect(normalised).toContain('query BuiltQuery($pokemonstatBaseStat1: Int!)');
		expect(normalised).toContain('{ pokemontypes: { type: { name: { _eq: "grass" } } } }');
		expect(normalised).toContain('{ pokemonabilities: { ability: { name: { _eq: "overgrow" } } } }');
		expect(normalised).toContain('{ pokemonmoves: { move: { name: { _eq: "razor-leaf" } } } }');
		expect(normalised).toContain('{ pokemonstats: { _and: [{ stat: { name: { _eq: "speed" } } }, { base_stat: { _gt: $pokemonstatBaseStat1 } }] } }');
		expect(normalised).toContain('order_by: { id: asc }');
		expect(normalised).toContain('limit: 20');
		expect(result.variables).toEqual({ pokemonstatBaseStat1: 30 });
	});

	it('coerces a float average into the integer column it is compared against', () => {
		const request = {
			...buildHeadlineRequest(),
			resolvedValues: new Map<string, number>([['pokemonstatBaseStat1', 72.4]]),
		};
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('complete');
		if (result.status !== 'complete') return;
		expect(result.variables).toEqual({ pokemonstatBaseStat1: 72 });
		expect(result.document.replace(/\s+/g, ' ')).toContain('query BuiltQuery($pokemonstatBaseStat1: Int!)');
	});

	it('reports incomplete when a subquery has no resolved value', () => {
		const request = { ...buildHeadlineRequest(), resolvedValues: new Map<string, number>() };
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.reason === 'unresolvedSubquery')).toBe(true);
	});

	it('reports incomplete for a rule with no operator, naming the offending node', () => {
		const brokenRule = createFilterRule({ fieldPath: ['name'], operatorName: '', operand: { source: 'literal', value: 'x' } });
		const request = {
			...buildHeadlineRequest(),
			filter: createFilterGroup({ children: [brokenRule] }),
			resolvedValues: new Map<string, number>(),
		};
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.nodeId === brokenRule.nodeId && issue.reason === 'incompleteRule')).toBe(true);
	});

	it('reports incomplete when nothing is selected', () => {
		const request = { ...buildHeadlineRequest(), selection: { fieldName: '', children: [] } };
		const result = compileQuery(request, hasuraDialect);

		expect(result.status).toBe('incomplete');
		if (result.status !== 'incomplete') return;
		expect(result.issues.some((issue) => issue.reason === 'emptySelection')).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./compile-query`.

- [ ] **Step 3: Write `build-selection.ts`**

```ts
import { Kind, type FieldNode, type SelectionSetNode } from 'graphql';

export interface SelectionNode {
	readonly fieldName: string;
	readonly children: readonly SelectionNode[];
}

function toFieldNode(selection: SelectionNode): FieldNode {
	return {
		kind: Kind.FIELD,
		name: { kind: Kind.NAME, value: selection.fieldName },
		...(selection.children.length > 0
			? { selectionSet: { kind: Kind.SELECTION_SET, selections: selection.children.map(toFieldNode) } as SelectionSetNode }
			: {}),
	};
}

export function buildSelectionSet(selection: SelectionNode): SelectionSetNode {
	return { kind: Kind.SELECTION_SET, selections: selection.children.map(toFieldNode) };
}
```

- [ ] **Step 4: Write `compile-query.ts`**

```ts
import { Kind, print, type ArgumentNode, type ValueNode, type VariableDefinitionNode } from 'graphql';
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import { coerceToGraphQLType, type LiteralValue } from '../model/literal-value';
import { isFilterGroup, type FieldOrdering, type FilterGroup, type QueryBuilderNode } from '../model/query-tree';
import { buildSelectionSet, type SelectionNode } from './build-selection';
import { buildWhereValueNode } from './build-where';
import { collectSubqueries } from './collect-subqueries';
import { enumValueNode, listValueNode, literalValueNode, objectValueNode } from './value-nodes';

export interface CompileRequest {
	readonly resourceName: string;
	readonly filter: FilterGroup;
	readonly selection: SelectionNode;
	readonly ordering: readonly FieldOrdering[];
	readonly limit: number;
	readonly resolvedValues: ReadonlyMap<string, LiteralValue>;
	readonly variableTypeNames: ReadonlyMap<string, string>;
}

export type CompileIssueReason = 'incompleteRule' | 'unresolvedSubquery' | 'emptySelection' | 'emptyFilter';

export interface CompileIssue {
	readonly nodeId: string | null;
	readonly reason: CompileIssueReason;
	readonly message: string;
}

export type CompileResult =
	| { readonly status: 'complete'; readonly document: string; readonly variables: Record<string, unknown> }
	| { readonly status: 'incomplete'; readonly issues: readonly CompileIssue[] };

function nameNode(value: string) {
	return { kind: Kind.NAME, value } as const;
}

function collectRuleIssues(group: FilterGroup): CompileIssue[] {
	const issues: CompileIssue[] = [];

	function visit(node: QueryBuilderNode): void {
		if (isFilterGroup(node)) {
			node.children.forEach(visit);
			return;
		}
		if (node.fieldPath.length === 0 || node.operatorName === '') {
			issues.push({ nodeId: node.nodeId, reason: 'incompleteRule', message: 'This rule needs both a field and an operator.' });
		}
	}

	visit(group);
	return issues;
}

function inferVariableTypeName(value: LiteralValue): string {
	if (typeof value === 'boolean') return 'Boolean';
	if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Float';
	return 'String';
}

function orderingValueNode(ordering: FieldOrdering): ValueNode {
	return ordering.fieldPath.reduceRight<ValueNode>((accumulated, fieldName) => objectValueNode([[fieldName, accumulated]]), enumValueNode(ordering.direction));
}

export function compileQuery(request: CompileRequest, dialect: QueryBuilderDialect): CompileResult {
	const issues: CompileIssue[] = collectRuleIssues(request.filter);

	if (request.selection.children.length === 0) {
		issues.push({ nodeId: null, reason: 'emptySelection', message: 'Choose at least one field to return.' });
	}

	const collected = collectSubqueries(request.filter);
	const variableNameByNodeId = new Map<string, string>();
	const variables: Record<string, unknown> = {};
	const variableDefinitions: VariableDefinitionNode[] = [];

	for (const entry of collected) {
		if (!request.resolvedValues.has(entry.variableName)) {
			for (const nodeId of entry.nodeIds) {
				issues.push({ nodeId, reason: 'unresolvedSubquery', message: 'This comparison value has not been resolved yet.' });
			}
			continue;
		}

		const resolved = request.resolvedValues.get(entry.variableName) as LiteralValue;
		const variableTypeName = request.variableTypeNames.get(entry.variableName) ?? inferVariableTypeName(resolved);
		const value = coerceToGraphQLType(resolved, variableTypeName);

		for (const nodeId of entry.nodeIds) {
			variableNameByNodeId.set(nodeId, entry.variableName);
		}
		variables[entry.variableName] = value;
		variableDefinitions.push({
			kind: Kind.VARIABLE_DEFINITION,
			variable: { kind: Kind.VARIABLE, name: nameNode(entry.variableName) },
			type: { kind: Kind.NON_NULL_TYPE, type: { kind: Kind.NAMED_TYPE, name: nameNode(variableTypeName) } },
		});
	}

	if (issues.length > 0) {
		return { status: 'incomplete', issues };
	}

	const argumentNodes: ArgumentNode[] = [
		{ kind: Kind.ARGUMENT, name: nameNode('where'), value: buildWhereValueNode(request.filter, dialect, variableNameByNodeId) },
	];

	if (request.ordering.length > 0) {
		const orderingNodes = request.ordering.map(orderingValueNode);
		argumentNodes.push({
			kind: Kind.ARGUMENT,
			name: nameNode('order_by'),
			value: orderingNodes.length === 1 ? orderingNodes[0] : listValueNode(orderingNodes),
		});
	}

	argumentNodes.push({ kind: Kind.ARGUMENT, name: nameNode('limit'), value: literalValueNode(request.limit) });

	const document = print({
		kind: Kind.DOCUMENT,
		definitions: [
			{
				kind: Kind.OPERATION_DEFINITION,
				operation: 'query' as const,
				name: nameNode('BuiltQuery'),
				...(variableDefinitions.length > 0 ? { variableDefinitions } : {}),
				selectionSet: {
					kind: Kind.SELECTION_SET,
					selections: [
						{
							kind: Kind.FIELD,
							name: nameNode(request.resourceName),
							arguments: argumentNodes,
							selectionSet: buildSelectionSet(request.selection),
						},
					],
				},
			},
		],
	});

	return { status: 'complete', document, variables };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 4 new tests. If the headline assertion fails, print `result.document` and compare against the spec's Validation section character by character.

- [ ] **Step 6: Export the core from the barrel**

```ts
export * from './lib/core/model/literal-value';
export * from './lib/core/model/query-tree';
export * from './lib/core/dialect/query-builder-dialect';
export * from './lib/core/dialect/hasura-dialect';
export * from './lib/core/metadata/introspection-types';
export * from './lib/core/metadata/read-boolean-expression';
export * from './lib/core/metadata/read-operators';
export * from './lib/core/metadata/catalog';
export * from './lib/core/compiler/build-selection';
export * from './lib/core/compiler/compile-query';
```

- [ ] **Step 7: Verify the whole library and lint**

Run: `pnpm nx test ui-query-builder && pnpm nx lint ui-query-builder`
Expected: PASS both.

- [ ] **Step 8: Commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): compile a filter tree into a GraphQL document and variables"
```

---

### Task 10: Verify the compiler against the live endpoint

**Files:**
- Create: `tools/query-builder/verify-against-endpoint.mjs`

**Interfaces:**
- Consumes: Task 9's `compileQuery`
- Produces: a throwaway verification script and a recorded result. This is a checkpoint, not a shipped feature.

This is the moment the compiler stops being trusted on unit tests alone. It requires the user's Hasura running.

- [ ] **Step 1: Write the verification script**

The script imports nothing from the library build; it re-states the headline request, calls `compileQuery`, POSTs the resolution document, then POSTs the built query with the resolved variables, and prints the matched names.

```js
import { compileQuery, hasuraDialect, createFilterGroup, createFilterRule } from '@pokemon-center/ui-query-builder';
import { buildResolutionDocument } from '../../libs/ui-query-builder/src/lib/core/compiler/build-resolution-document.js';
import { collectSubqueries } from '../../libs/ui-query-builder/src/lib/core/compiler/collect-subqueries.js';

const endpoint = process.argv[2] ?? 'http://localhost:8080/v1/graphql';

async function post(query, variables) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	});
	const payload = await response.json();
	if (payload.errors) throw new Error(JSON.stringify(payload.errors, null, 2));
	return payload.data;
}
```

Because the library is TypeScript, run this through the workspace's TypeScript-aware runner rather than bare node. If that proves awkward, write the verification as a Jest test tagged to be skipped by default instead, in `libs/ui-query-builder/src/lib/core/compiler/compile-query.endpoint.spec.ts`, guarded by an environment variable:

```ts
const endpoint = process.env['QUERY_BUILDER_ENDPOINT'];
const describeEndpoint = endpoint ? describe : describe.skip;

describeEndpoint('compiled query against a live endpoint', () => {
	it('returns the sixteen validated matches', async () => {
		// build the headline request, resolve, execute, assert names
	});
});
```

**Prefer the guarded Jest form.** It reuses the fixtures and types, it never runs in normal test runs, and it is the same code path the unit tests exercise.

- [ ] **Step 2: Run it**

```bash
QUERY_BUILDER_ENDPOINT=http://localhost:8080/v1/graphql pnpm nx test ui-query-builder
```

Expected: the built query returns exactly these 16 names — bulbasaur, ivysaur, venusaur, chikorita, bayleef, meganium, turtwig, grotle, torterra, rowlet, dartrix, decidueye, grookey, thwackey, rillaboom, decidueye-hisui.

- [ ] **Step 3: If the result differs, stop and report**

Do not adjust the expectation to match the output. A mismatch means the compiler differs from the validated query in the spec; find the difference in the printed document first.

- [ ] **Step 4: Commit**

```bash
git add libs/ui-query-builder tools/query-builder
git commit -m "test(query-builder): verify the compiled query against a live Hasura endpoint"
```

---

### Task 11: Signal Forms recursion spike

> **DECIDED 2026-09-07 — Outcome A: recursive schema works, bind the whole tree.** Mutually recursive `schema()` consts plus `applyEach` over `children` and `applyWhenValue` for the `group | rule` union bind an arbitrarily deep tree. A nested rule's field is readable and writable with write-through to the source signal, a `required` error two levels deep surfaces and aggregates to the root, and a branch grafted in after `form()` was created still picks up the schema. Type-checks under `strict` + `moduleResolution: bundler` with no casts, including against the real `readonly` `FilterGroup`. Tasks 12–15 bind through Signal Forms end to end; the fallback shape described under Task 12 does not apply. Full findings: `.superpowers/sdd/2026-09-06-graphql-query-builder/task-11-report.md`.

**Files:**
- Create: `libs/ui-query-builder/src/lib/session/signal-forms-recursion.spec.ts` (may be deleted at the end of the task)

**Interfaces:**
- Consumes: nothing
- Produces: **a decision**, recorded in the plan and in the commit message: either "recursive schema works, bind the whole tree" or "fallback: store owns the tree, Signal Forms owns each rule editor".

This is the spec's named risk. It runs **before** any component is built on the assumption.

- [ ] **Step 1: Read the current API surface**

Check what `@angular/forms/signals` actually exports in this install:

```bash
node -e "console.log(Object.keys(require('@angular/forms/signals')))"
```

If that fails because the package is ESM-only, inspect `node_modules/@angular/forms/signals/index.d.ts` instead. Do not proceed from memory of the API — read it.

- [ ] **Step 2: Write a spike test binding a two-level nested tree**

Model a minimal recursive shape (a group with children that are groups or rules), build a `form()` over a `signal` of it, and assert that a nested rule's field is reachable and writable through the form, and that a validation error on a nested rule surfaces.

- [ ] **Step 3: Run it**

Run: `pnpm nx test ui-query-builder`

- [ ] **Step 4: Record the decision**

If it passes: components in Tasks 13–15 bind through Signal Forms end to end.

If it fails or requires contortions: **the fallback applies** — `QueryBuilderStore` owns the tree as plain immutable data with explicit update methods, and Signal Forms is used only inside `filter-rule` for the leaf editor (field, operator, operand), which is a flat, non-recursive shape. Record which path was taken at the top of `query-builder.store.ts` file's commit message, and note it in this plan file next to this task.

- [ ] **Step 5: Commit**

```bash
git add libs/ui-query-builder docs/superpowers/plans/2026-09-06-graphql-query-builder.md
git commit -m "spike(query-builder): determine whether Signal Forms binds a recursive tree"
```

---

### Task 12: The session store and the overlay

**Files:**
- Create: `libs/ui-query-builder/src/lib/overlay/query-builder-overlay.ts`
- Create: `libs/ui-query-builder/src/lib/session/query-builder.store.ts`
- Test: `libs/ui-query-builder/src/lib/session/query-builder.store.spec.ts`
- Modify: `libs/ui-query-builder/src/index.ts`

**Interfaces:**
- Consumes: Tasks 2, 6, 9, 11
- Produces: `QueryBuilderOverlay`, `QUERY_BUILDER_OVERLAY` token, `QUERY_BUILDER_ENDPOINT` token, `QueryBuilderStore` with signals `resourceName`, `filter`, `selection`, `ordering`, `limit`, `resolvedValues`, `compileResult`, and methods `selectResource`, `addRule`, `addGroup`, `updateRule`, `removeNode`, `setCombinator`, `toggleNegated`, `setRelationScope`, `setResolvedValue`.

- [ ] **Step 1: Write `query-builder-overlay.ts`**

```ts
import { InjectionToken } from '@angular/core';

export interface ResourceOverlay {
	readonly displayLabel?: string;
	readonly defaultSelectionFieldNames?: readonly string[];
	readonly pinnedFieldNames?: readonly string[];
	readonly hiddenFieldNames?: readonly string[];
}

export interface QueryBuilderOverlay {
	readonly resources: Readonly<Record<string, ResourceOverlay>>;
	readonly fieldLabels: Readonly<Record<string, string>>;
}

export const emptyQueryBuilderOverlay: QueryBuilderOverlay = { resources: {}, fieldLabels: {} };

export const QUERY_BUILDER_OVERLAY = new InjectionToken<QueryBuilderOverlay>('QUERY_BUILDER_OVERLAY', {
	providedIn: 'root',
	factory: () => emptyQueryBuilderOverlay,
});

export const QUERY_BUILDER_ENDPOINT = new InjectionToken<string>('QUERY_BUILDER_ENDPOINT');
```

`QUERY_BUILDER_ENDPOINT` has **no factory** on purpose: the library must not name an endpoint, so a consumer that forgets to provide it fails loudly at injection rather than silently calling the wrong host.

- [ ] **Step 2: Write the failing store test**

```ts
import { TestBed } from '@angular/core/testing';
import { QueryBuilderStore } from './query-builder.store';

describe('QueryBuilderStore', () => {
	function createStore() {
		return TestBed.configureTestingModule({ providers: [QueryBuilderStore] }).inject(QueryBuilderStore);
	}

	it('starts with an empty AND group and no resource', () => {
		const store = createStore();

		expect(store.resourceName()).toBe('');
		expect(store.filter().combinator).toBe('and');
		expect(store.filter().children).toEqual([]);
	});

	it('adds a rule to the root group', () => {
		const store = createStore();
		store.addRule(store.filter().nodeId);

		expect(store.filter().children).toHaveLength(1);
	});

	it('updates a rule in place without disturbing its siblings', () => {
		const store = createStore();
		store.addRule(store.filter().nodeId);
		store.addRule(store.filter().nodeId);
		const [first, second] = store.filter().children;

		store.updateRule(first.nodeId, { fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } });

		const updated = store.filter().children;
		expect(updated[0]).toMatchObject({ fieldPath: ['name'], operatorName: '_eq' });
		expect(updated[1].nodeId).toBe(second.nodeId);
	});

	it('removes a node by identifier, including from a nested group', () => {
		const store = createStore();
		store.addGroup(store.filter().nodeId);
		const nested = store.filter().children[0];
		store.addRule(nested.nodeId);
		const nestedRule = (store.filter().children[0] as { children: { nodeId: string }[] }).children[0];

		store.removeNode(nestedRule.nodeId);

		expect((store.filter().children[0] as { children: unknown[] }).children).toEqual([]);
	});

	it('reports the compile result as incomplete while the builder is empty', () => {
		const store = createStore();

		expect(store.compileResult().status).toBe('incomplete');
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./query-builder.store`.

- [ ] **Step 4: Implement the store**

Use `signalStore` from `@ngrx/signals` with `withState`, `withComputed` and `withMethods`, per the workspace convention that `@ngrx/signals` is the state library. The tree updates are pure immutable rewrites — write a private `replaceNode(root, nodeId, replacer)` helper that walks the tree and rebuilds only the path to the changed node. `compileResult` is a `computed` calling `compileQuery` with the current state and `hasuraDialect`.

If Task 11 chose the fallback path, this store owns the tree outright, which is the shape written above.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 5 new tests.

- [ ] **Step 6: Commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): add the session store and the display overlay"
```

---

### Task 13: The introspection fetcher and resource discovery over HTTP

**Files:**
- Create: `libs/ui-query-builder/src/lib/session/http-introspection-fetcher.ts`
- Create: `libs/ui-query-builder/src/lib/core/metadata/read-resources.ts`
- Test: `libs/ui-query-builder/src/lib/session/http-introspection-fetcher.spec.ts`
- Test: `libs/ui-query-builder/src/lib/core/metadata/read-resources.spec.ts`

**Interfaces:**
- Consumes: Task 6's `IntrospectionFetcher`, Task 12's `QUERY_BUILDER_ENDPOINT`
- Produces: `createHttpIntrospectionFetcher()`, `ResourceDescriptor`, `readResources(queryRootFields, dialect)`, `discoverResources()`.

This is the **bootstrap** step from the spec — the 147 KB one-time fetch that yields all 160 resources. Without it the builder has no resource list to start from.

- [ ] **Step 1: Write the failing test**

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QUERY_BUILDER_ENDPOINT } from '../overlay/query-builder-overlay';
import { createHttpIntrospectionFetcher } from './http-introspection-fetcher';

describe('http introspection fetcher', () => {
	it('posts a __type query to the configured endpoint and unwraps the result', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
		});

		const fetcher = TestBed.runInInjectionContext(() => createHttpIntrospectionFetcher());
		const pending = fetcher('pokemon_bool_exp');

		const controller = TestBed.inject(HttpTestingController);
		const request = controller.expectOne('/api/graphql');
		expect(request.request.method).toBe('POST');
		expect(request.request.body.variables).toEqual({ typeName: 'pokemon_bool_exp' });

		request.flush({ data: { __type: { name: 'pokemon_bool_exp', kind: 'INPUT_OBJECT', inputFields: [] } } });

		await expect(pending).resolves.toMatchObject({ name: 'pokemon_bool_exp' });
		controller.verify();
	});

	it('resolves null for a type the endpoint does not know', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/graphql' }],
		});

		const fetcher = TestBed.runInInjectionContext(() => createHttpIntrospectionFetcher());
		const pending = fetcher('nope_bool_exp');

		TestBed.inject(HttpTestingController).expectOne('/api/graphql').flush({ data: { __type: null } });

		await expect(pending).resolves.toBeNull();
	});
});
```

`QUERY_BUILDER_ENDPOINT` lives in `../overlay/query-builder-overlay` per Task 12. Do not create a second token.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test ui-query-builder`
Expected: FAIL — cannot resolve `./http-introspection-fetcher`.

- [ ] **Step 3: Implement it**

```ts
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { IntrospectionFetcher } from '../core/metadata/catalog';
import type { IntrospectionInputObject } from '../core/metadata/introspection-types';
import { QUERY_BUILDER_ENDPOINT } from '../overlay/query-builder-overlay';

const introspectTypeQuery = `query IntrospectType($typeName: String!) {
	__type(name: $typeName) {
		name
		kind
		inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
	}
}`;

interface IntrospectTypeResponse {
	readonly data?: { readonly __type: IntrospectionInputObject | null };
	readonly errors?: readonly { readonly message: string }[];
}

export function createHttpIntrospectionFetcher(): IntrospectionFetcher {
	const httpClient = inject(HttpClient);
	const endpoint = inject(QUERY_BUILDER_ENDPOINT);

	return async (typeName) => {
		const response = await firstValueFrom(
			httpClient.post<IntrospectTypeResponse>(endpoint, { query: introspectTypeQuery, variables: { typeName } }),
		);

		if (response.errors?.length) {
			throw new Error(response.errors.map((error) => error.message).join('; '));
		}

		return response.data?.__type ?? null;
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test ui-query-builder`
Expected: PASS, 2 new tests.

- [ ] **Step 5: Write the failing resource-discovery test**

```ts
import { hasuraDialect } from '../dialect/hasura-dialect';
import { readResources, type QueryRootField } from './read-resources';

const queryRootFields: QueryRootField[] = [
	{ name: 'pokemon', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'pokemon_bool_exp' } }, { name: 'limit', type: { kind: 'SCALAR', name: 'Int' } }] },
	{ name: 'pokemon_aggregate', args: [{ name: 'where', type: { kind: 'INPUT_OBJECT', name: 'pokemon_bool_exp' } }] },
	{ name: 'pokemon_by_pk', args: [{ name: 'id', type: { kind: 'SCALAR', name: 'Int' } }] },
	{ name: 'languages', args: [] },
];

describe('readResources', () => {
	it('keeps only fields that accept a where argument', () => {
		const resources = readResources(queryRootFields, hasuraDialect);

		expect(resources.map((resource) => resource.resourceName)).not.toContain('languages');
		expect(resources.map((resource) => resource.resourceName)).not.toContain('pokemon_by_pk');
	});

	it('excludes the aggregate variants, which are not leading resources', () => {
		const resources = readResources(queryRootFields, hasuraDialect);

		expect(resources.map((resource) => resource.resourceName)).toEqual(['pokemon']);
	});

	it('records the boolean expression type each resource filters through', () => {
		const resources = readResources(queryRootFields, hasuraDialect);

		expect(resources[0]).toEqual({ resourceName: 'pokemon', booleanExpressionTypeName: 'pokemon_bool_exp' });
	});
});
```

- [ ] **Step 6: Run test to verify it fails, then write `read-resources.ts`**

```ts
import type { QueryBuilderDialect } from '../dialect/query-builder-dialect';
import type { IntrospectionTypeReference } from './introspection-types';
import { unwrapTypeName } from './read-boolean-expression';

export interface QueryRootArgument {
	readonly name: string;
	readonly type: IntrospectionTypeReference;
}

export interface QueryRootField {
	readonly name: string;
	readonly args: readonly QueryRootArgument[];
}

export interface ResourceDescriptor {
	readonly resourceName: string;
	readonly booleanExpressionTypeName: string;
}

export function readResources(queryRootFields: readonly QueryRootField[], dialect: QueryBuilderDialect): readonly ResourceDescriptor[] {
	const descriptors: ResourceDescriptor[] = [];

	for (const field of queryRootFields) {
		if (field.name.endsWith('_aggregate') || field.name.endsWith('_by_pk')) continue;

		const whereArgument = field.args.find((argument) => argument.name === 'where');
		if (!whereArgument) continue;

		const booleanExpressionTypeName = unwrapTypeName(whereArgument.type);
		if (!dialect.isBooleanExpressionTypeName(booleanExpressionTypeName)) continue;

		descriptors.push({ resourceName: field.name, booleanExpressionTypeName });
	}

	return descriptors;
}
```

- [ ] **Step 7: Add `discoverResources` to the HTTP layer**

In `http-introspection-fetcher.ts`, add a second exported factory that POSTs the bootstrap query and passes the result through `readResources`:

```ts
const introspectQueryRootQuery = `query IntrospectQueryRoot {
	__type(name: "query_root") {
		fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } }
	}
}`;
```

Cache the resolved list in a module-scoped promise the same way the catalog caches types, so the 147 KB bootstrap is paid once per session and concurrent callers share one request.

- [ ] **Step 8: Verify the bootstrap against the live endpoint**

Behind the same `QUERY_BUILDER_ENDPOINT` environment guard as Task 10, assert the discovery returns **160** resources and that the list contains `pokemon`, `pokemonstat`, `move` and `ability`. If the count differs, stop and report — that number came from measurement.

- [ ] **Step 9: Run tests and commit**

Run: `pnpm nx test ui-query-builder`

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): fetch introspection types and discover resources over http"
```

---

### Task 14: The rule editor components

**Files:**
- Create: `libs/ui-query-builder/src/lib/components/field-path-picker/field-path-picker.component.ts`
- Create: `libs/ui-query-builder/src/lib/components/operand-editor/operand-editor.component.ts`
- Create: `libs/ui-query-builder/src/lib/components/filter-rule/filter-rule.component.ts`
- Test: one `.spec.ts` beside each

**Interfaces:**
- Consumes: Tasks 2, 6, 12
- Produces: `pokedex-field-path-picker`, `pokedex-operand-editor`, `pokedex-filter-rule` selectors with signal inputs and outputs.

**Before writing any of these, invoke the `pokedex-component` skill** — it carries the design-system recipe (tokens, CDK usage, accessibility) this workspace expects.

- [ ] **Step 1: Write the failing `field-path-picker` test**

Test with Spectator that: given a stub catalog, the picker lists scalar and relation fields for the current level; clicking a relation drills one level deeper and appends to the path; a breadcrumb allows stepping back; choosing a scalar emits `pathChosen` with the full path.

- [ ] **Step 2: Run to verify it fails, then implement**

Standalone, `OnPush`, `input.required<QueryBuilderCatalog>()`, `input<string[]>` for the current path, `output<string[]>()` for the chosen path. Use CDK overlay for the drill-down panel. Fields come from `catalog.readBooleanExpressionFields`, so the component is driven entirely by introspection and never hardcodes a field name.

- [ ] **Step 3: Write the failing `operand-editor` test**

Test that: it renders a literal input by default; switching source to subquery reveals the subquery editor; the emitted operand matches the discriminated union in `query-tree.ts`; a resolved subquery displays its resolved value alongside its description.

- [ ] **Step 4: Run to verify it fails, then implement**

- [ ] **Step 5: Write the failing `filter-rule` test**

This one matters most: it proves operators come from introspection rather than a hardcoded array, which is the whole premise of the catalog.

```ts
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import fixture from '../../core/metadata/__fixtures__/hasura-introspection.fixture.json';
import { hasuraDialect } from '../../core/dialect/hasura-dialect';
import { createQueryBuilderCatalog } from '../../core/metadata/catalog';
import type { IntrospectionInputObject } from '../../core/metadata/introspection-types';
import { createFilterRule } from '../../core/model/query-tree';
import { FilterRuleComponent } from './filter-rule.component';

const catalog = createQueryBuilderCatalog(
	async (typeName) => (fixture as Record<string, IntrospectionInputObject>)[typeName] ?? null,
	hasuraDialect,
);

describe('FilterRuleComponent', () => {
	let spectator: Spectator<FilterRuleComponent>;
	const createComponent = createComponentFactory({ component: FilterRuleComponent });

	it('offers exactly the nine integer operators for an integer field', async () => {
		spectator = createComponent({ props: { catalog, rule: createFilterRule({ fieldPath: ['height'], operatorName: '_eq' }), comparisonTypeName: 'Int_comparison_exp' } });
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]').map((option) => option.textContent?.trim());
		expect(options).toHaveLength(9);
		expect(options).toContain('_gt');
		expect(options).not.toContain('_ilike');
	});

	it('offers the nineteen string operators for a string field', async () => {
		spectator = createComponent({ props: { catalog, rule: createFilterRule({ fieldPath: ['name'], operatorName: '_eq' }), comparisonTypeName: 'String_comparison_exp' } });
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		const options = spectator.queryAll('[data-testid="operator-option"]');
		expect(options).toHaveLength(19);
	});

	it('shows a validation message when the rule has no operator', async () => {
		spectator = createComponent({ props: { catalog, rule: createFilterRule({ fieldPath: ['name'], operatorName: '' }), comparisonTypeName: 'String_comparison_exp' } });
		await spectator.fixture.whenStable();
		spectator.detectChanges();

		expect(spectator.query('[data-testid="rule-issue"]')).toExist();
	});
});
```

Adjust the input names to match the component you write, but keep the three assertions — the operator counts are the point.

- [ ] **Step 6: Run to verify it fails, then implement**

- [ ] **Step 7: Run the full suite and lint**

Run: `pnpm nx test ui-query-builder && pnpm nx lint ui-query-builder`
Expected: PASS both.

- [ ] **Step 8: Commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): add the field picker, operand editor and rule editor"
```

---

### Task 15: The recursive group and the builder shell

**Files:**
- Create: `libs/ui-query-builder/src/lib/components/filter-group/filter-group.component.ts`
- Create: `libs/ui-query-builder/src/lib/components/query-preview/query-preview.component.ts`
- Create: `libs/ui-query-builder/src/lib/components/selection-editor/selection-editor.component.ts`
- Create: `libs/ui-query-builder/src/lib/components/query-builder/query-builder.component.ts`
- Test: one `.spec.ts` beside each
- Modify: `libs/ui-query-builder/src/index.ts`

**Interfaces:**
- Consumes: Tasks 12 and 14
- Produces: `pokedex-query-builder` with `output<CompiledQuery>()` where `CompiledQuery = { document: string; variables: Record<string, unknown> }`.

- [ ] **Step 1: Write the failing `filter-group` test**

The self-referencing template is the risky part — a component using its own selector inside its own template. Prove it renders to depth before building on it.

```ts
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { createFilterGroup, createFilterRule } from '../../core/model/query-tree';
import { FilterGroupComponent } from './filter-group.component';

describe('FilterGroupComponent', () => {
	let spectator: Spectator<FilterGroupComponent>;
	const createComponent = createComponentFactory({ component: FilterGroupComponent });

	it('renders one rule editor per rule child', () => {
		const group = createFilterGroup({
			children: [
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'a' } }),
				createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'b' } }),
			],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.queryAll('pokedex-filter-rule')).toHaveLength(2);
	});

	it('renders itself recursively for nested groups', () => {
		const group = createFilterGroup({
			children: [
				createFilterGroup({
					children: [createFilterRule({ fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'deep' } })],
				}),
			],
		});
		spectator = createComponent({ props: { group } });

		expect(spectator.queryAll('pokedex-filter-group').length).toBeGreaterThanOrEqual(1);
		expect(spectator.queryAll('pokedex-filter-rule')).toHaveLength(1);
	});

	it('emits a combinator change when the AND/OR toggle is used', () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group } });
		const emitted: string[] = [];
		spectator.component.combinatorChanged.subscribe((value: string) => emitted.push(value));

		spectator.click('[data-testid="combinator-or"]');

		expect(emitted).toEqual(['or']);
	});

	it('emits a negation change when the NOT toggle is used', () => {
		const group = createFilterGroup();
		spectator = createComponent({ props: { group } });
		const emitted: boolean[] = [];
		spectator.component.negatedChanged.subscribe((value: boolean) => emitted.push(value));

		spectator.click('[data-testid="negate-toggle"]');

		expect(emitted).toEqual([true]);
	});
});
```

If the self-reference fails to compile, the fallback is `@defer`-free explicit recursion via an `ng-template` with `ngTemplateOutlet` recursing on itself. Try the direct self-reference first — Angular supports it for standalone components that import themselves.

- [ ] **Step 2: Run to verify it fails, then implement**

- [ ] **Step 3: Write the failing `query-preview` test**

Test that: a complete result renders the printed document and its variables; an incomplete result renders each issue's message rather than a document; the copy button places the document on the clipboard.

- [ ] **Step 4: Run to verify it fails, then implement**

- [ ] **Step 5: Write the failing `selection-editor` test**

Test that: the default selection comes from the overlay for the chosen resource; adding a field updates the store's selection; removing the last field leaves the compile result `incomplete` with reason `emptySelection`.

- [ ] **Step 6: Run to verify it fails, then implement**

- [ ] **Step 7: Write the failing `query-builder` shell test**

Test that: choosing a resource resets the filter to an empty root group; the shell emits its `compiled` output only when the compile result is `complete`; the headline query can be assembled through the components and the emitted document matches Task 9's expectation.

That last assertion is the integration test for the whole library. It is the one that proves the UI and the compiler agree.

- [ ] **Step 8: Run to verify it fails, then implement**

- [ ] **Step 9: Export the components and run everything**

Run: `pnpm nx test ui-query-builder && pnpm nx lint ui-query-builder`
Expected: PASS both.

- [ ] **Step 10: Commit**

```bash
git add libs/ui-query-builder
git commit -m "feat(query-builder): add the recursive filter group and the builder shell"
```

---

### Task 16: The `query-explorer` feature in domain-pokedex

**Files:**
- Create: `libs/domain-pokedex/src/lib/features/query-explorer/query-explorer.component.ts`
- Test: `libs/domain-pokedex/src/lib/features/query-explorer/query-explorer.component.spec.ts`
- Modify: the domain's route configuration (find it with `grep -rn "loadComponent" libs/domain-pokedex/src`)
- Modify: `apps/pokemon-center/proxy.conf.mjs` if a proxy entry for the Hasura endpoint is needed

**Interfaces:**
- Consumes: `pokedex-query-builder` (Task 15), `UiDataGridComponent` from `@pokemon-center/ui-pokedex`
- Produces: a routed page.

**Before touching grid code, invoke the `ag-dev` skill** — it grounds AG Grid work in the APIs that exist in version 36 rather than recalled ones.

- [ ] **Step 1: Provide the endpoint**

The builder's `QUERY_BUILDER_ENDPOINT` has no default. Provide it at this component's route, pointing at a **relative, proxied** path per the workspace rule that the frontend never hardcodes a port. Add a proxy entry routing that path to `http://localhost:8080/v1/graphql`, following the existing entries in `apps/pokemon-center/proxy.conf.mjs`.

- [ ] **Step 2: Write the failing test**

Test that: the component renders the builder; when the builder emits a compiled query, an `httpResource` request is issued to the configured endpoint carrying that document and its variables; the returned rows reach the grid; a GraphQL error renders an error state rather than an empty grid.

- [ ] **Step 3: Run to verify it fails, then implement**

Follow the `gqlResource` pattern in `libs/data-access-pokedex/src/lib/gql-resource.ts` — POST `{ query, variables }`, throw on `errors`, return `data` — but the document here is dynamic rather than a `TypedDocumentString`, so this is a sibling of that helper rather than a reuse of it.

- [ ] **Step 4: Derive grid columns from the selection**

Column definitions come from the emitted selection, not a hardcoded list, per the spec. A scalar leaf becomes a column; a nested selection becomes a column whose value getter walks the path.

- [ ] **Step 5: Run the affected projects**

Run: `pnpm nx run-many -t test lint -p ui-query-builder domain-pokedex`
Expected: PASS.

- [ ] **Step 6: Manually verify in the running app**

```bash
pnpm start
```

Navigate to the query explorer route, build the headline query through the UI, and confirm the grid shows the 16 expected Pokemon. **This is the acceptance criterion for the whole plan.**

- [ ] **Step 7: Commit**

```bash
git add libs/domain-pokedex apps/pokemon-center
git commit -m "feat(pokedex): add the query explorer page wiring the builder to the grid"
```

---

## Execution Notes

- **The suite takes roughly three minutes.** During the inner TDD loop, narrow it — the Jest 30 flag is `--testPathPatterns` (renamed from the Jest 29 `--testPathPattern`; the old spelling silently does nothing):

```bash
pnpm nx test ui-query-builder --testPathPatterns=build-where
```

Run the unnarrowed suite before every commit.

- **Tasks 4, 10, 13 (step 8) and 16 need the user's Hasura running** at `http://localhost:8080/v1/graphql`. Every other task is offline.
- **Task 11 gates Tasks 12 and 15.** Do not build components on Signal Forms recursion before the spike answers whether it works.
- **Tasks 14 and 15 are the least specified**, deliberately: they are UI, the `pokedex-component` skill owns their conventions, and their behaviour is pinned by the tests listed rather than by prescribed markup. If a component grows past roughly 150 lines, split it.
- If any verified schema fact in this plan turns out not to hold against the endpoint, **stop and report** rather than adapting the expectation. Those numbers came from measurement, and a mismatch means something changed that the design depends on.
