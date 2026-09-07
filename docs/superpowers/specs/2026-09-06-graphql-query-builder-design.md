# GraphQL Query Builder — Design

**Status:** approved scope, ready for implementation plan.

## Why

The pokedex frontend can only ask the questions someone already wrote a resolver for. `pokemonList` takes `generation`, `search`, `types`, `versionGroup`, `sortBy` — a fixed vocabulary. Every new question ("which Grass starters outrun Snorlax?") is a backend change.

A query builder inverts that: the user composes the question, and the component compiles it into a GraphQL document. One component, and the set of answerable questions becomes the set of expressible filters rather than the set of hand-written resolvers.

`ngx-query-builder` is the reference for the interaction model only. It predates signals, targets an abstract rule format rather than GraphQL, and has no concept of a selection set, of relations, or of an operand that is itself a query. The model here is built for GraphQL from the start.

## Target and scope

**The builder is a pure frontend compiler.** It emits a GraphQL document plus variables. It does not filter results in the browser, and it requires no change to `pokedex-service`.

The target is a **Hasura-shaped** endpoint. During design this was validated against a local PokeAPI Hasura deployment at `http://localhost:8080/v1/graphql`. Every schema fact below was read off that endpoint, not recalled.

| Measurement | Value |
|---|---|
| Types in schema | 4301 |
| Query root fields | 321 |
| Fields accepting `where` | 320 |
| `_aggregate` fields | 160 |
| Leading resources (excluding `_aggregate`/`_by_pk`) | **160** |
| Full introspection payload | **7.5 MB** |

Resource naming is modern PokeAPI — `pokemon`, `pokemonstats`, `pokemontypes`, `pokemonabilities`, `pokemonmoves` — **not** the legacy `pokemon_v2_*` prefix that older PokeAPI GraphQL documentation shows.

## Validation — this design was executed before it was written

The headline requirement is: *all Pokemon with type Grass and ability Overgrow that learn Razor Leaf and are faster than Snorlax.* The two-phase output the compiler is specified to produce was hand-compiled and run against the live endpoint.

Phase one, operand resolution:

```graphql
query ResolveOperands {
  snorlaxSpeed: pokemonstat(
    where: { pokemon: { name: { _eq: "snorlax" } }, stat: { name: { _eq: "speed" } } }
    order_by: { id: asc }
    limit: 1
  ) { base_stat }
}
```

Returned `30`. Phase two, the built query:

```graphql
query BuiltQuery($snorlaxSpeed: Int!) {
  pokemon(
    where: {
      _and: [
        { pokemontypes: { type: { name: { _eq: "grass" } } } }
        { pokemonabilities: { ability: { name: { _eq: "overgrow" } } } }
        { pokemonmoves: { move: { name: { _eq: "razor-leaf" } } } }
        { pokemonstats: {
            stat: { name: { _eq: "speed" } }
            base_stat: { _gt: $snorlaxSpeed }
        } }
      ]
    }
    order_by: { id: asc }
    limit: 20
  ) {
    id
    name
    pokemonstats(where: { stat: { name: { _eq: "speed" } } }) { base_stat }
  }
}
```

Returned 16 correct rows: bulbasaur 45, ivysaur 60, venusaur 80, chikorita 45, bayleef 60, meganium 80, turtwig 31, grotle 36, torterra 56, rowlet 42, dartrix 52, decidueye 70, grookey 65, thwackey 80, rillaboom 85, decidueye-hisui 60.

Note the two spellings, both correct and both verified: the **root query field** is singular (`pokemonstat`), while the **relation** on `pokemon_bool_exp` is plural (`pokemonstats`). This is not a typo to be tidied away.

This output is the compiler's contract. It becomes the first test case.

## Architecture

### Placement — `libs/ui-query-builder`

```
src/lib/core/          framework-free, zero Angular imports
  metadata/            targeted introspection -> catalog
  model/               the query tree types
  compiler/            tree -> { document, variables }
  dialect/             the Hasura-shaped conventions, behind one interface
src/lib/components/    the Angular UI
src/lib/overlay/       display polish and its injection token
```

`core/` is plain TypeScript, testable without TestBed and without network. That seam is the reason this is a library rather than a folder inside `domain-pokedex`.

The consumer is a new `query-explorer` feature in `libs/domain-pokedex/src/lib/features/`. It takes the emitted `{ document, variables }`, runs it through the existing `gqlResource` pattern, and renders results into the AG Grid wrapper in `ui-pokedex`. **The builder library never imports AG Grid and never names an endpoint.**

### Query construction uses `graphql`, not string concatenation

`graphql@16` is already a direct dependency. The compiler builds a real GraphQL AST and hands it to `print()`. This removes an entire class of defects that string-building query builders suffer: enum values must be unquoted, variables must be unquoted, strings must be escaped, nested input objects must not trail commas. None of that is our problem if we never write the syntax ourselves.

## The model

One recursive, immutable, serializable tree. It is what gets saved, shared through the URL, and diffed in tests.

```ts
type QueryBuilderNode = FilterGroup | FilterRule;

interface FilterGroup {
	readonly kind: 'group';
	readonly nodeId: string;
	readonly combinator: 'and' | 'or';
	readonly negated: boolean;
	readonly relationScope: RelationScope | null;
	readonly children: readonly QueryBuilderNode[];
}

interface RelationScope {
	readonly fieldPath: readonly string[];
	readonly quantifier: 'some' | 'none';
}

interface FilterRule {
	readonly kind: 'rule';
	readonly nodeId: string;
	readonly fieldPath: readonly string[];
	readonly operatorName: string;
	readonly operand: FilterOperand;
}

type FilterOperand =
	| { readonly source: 'literal'; readonly value: LiteralValue }
	| { readonly source: 'subquery'; readonly subquery: ScalarSubquery };

interface ScalarSubquery {
	readonly resourceName: string;
	readonly filter: FilterGroup | null;
	readonly selector: ScalarSelector;
}

type ScalarSelector =
	| {
			readonly kind: 'row';
			readonly fieldPath: readonly string[];
			readonly ordering: FieldOrdering | null;
	  }
	| {
			readonly kind: 'aggregate';
			readonly functionName: AggregateFunctionName;
			readonly fieldPath: readonly string[];
	  };
```

### Why `relationScope` exists

Without it a rule is one path to one leaf comparison. That expresses "learns Razor Leaf" but **not** "learns a move that is Grass **and** has power over 90", because those two conditions must hold on the **same** related row — two sibling rules would each be satisfied by a different move.

This is not hypothetical: the validated query above already needs it. The fourth clause pins `stat.name = speed` and `base_stat > $snorlaxSpeed` to the same `pokemonstats` row. Sibling rules would have compared Snorlax's Speed against some other stat entirely.

A group carrying a relation scope compiles its children inside that relation object. `quantifier: 'none'` compiles as `_not: { <relation>: { ... } }`.

### Why operands are subqueries

"Snorlax's Speed" and "the average Speed" are not different kinds of thing. Both are a value that must be resolved to a scalar before the real query can run. Modelling them as one concept — a subquery constrained to yield exactly one scalar — collapses two special cases into one and makes the set of expressible operands open-ended.

| Intent | Subquery |
|---|---|
| faster than Snorlax | `pokemonstat`, filter `pokemon.name _eq "snorlax" AND stat.name _eq "speed"`, selector `row -> base_stat` |
| faster than average | `pokemonstat`, filter `stat.name _eq "speed"`, selector `aggregate avg base_stat` |
| faster than the fastest Fire type | `pokemonstat`, filter `stat.name _eq "speed" AND pokemon is fire`, selector `aggregate max base_stat` |

`filter` is a `FilterGroup` — the same type, compiled by the same compiler, edited by the same editor scoped down. The subquery feature costs one operand branch, not a second builder.

Percentile operands are **out of scope**. Hasura exposes `count`, `avg`, `max`, `min`, `sum`, `stddev` and `variance`; Postgres's `percentile_cont` is not surfaced. Percentile would require a count-then-offset ranked lookup and a second resolution wave, which is not worth it for a first release.

### Constraints the model enforces

- **Exactly one scalar, structurally.** The `row` selector offers only scalar leaf paths from the catalog and always emits `limit: 1`. The `aggregate` selector offers only functions introspection actually found. There is no way to build a subquery returning a list.
- **Deterministic row selection.** A `row` selector always emits an ordering — the user's if set, otherwise primary key ascending. A filter matching three rows must not return whichever row the query planner preferred.
- **Single resolution wave.** A subquery's own filter takes literal operands only, so every subquery in a tree resolves in one parallel batch. The model does not forbid nesting later; the compiler simply does not yet do dependency-ordered waves.

## The metadata catalog

### Lazy targeted introspection, not full introspection

Full introspection is 7.5 MB. Nobody pays that on app boot. Measured alternative:

| Fetch | Payload |
|---|---|
| Full introspection | 7,500 KB |
| Bootstrap: `__type(name: "query_root")` fields and `where` argument types | **147 KB** |
| One drill: `__type(name: "pokemon_bool_exp")` | **4.5 KB** |
| One operator set: `__type(name: "Int_comparison_exp")` | **0.8 KB** |

The catalog is therefore built from targeted `__type` queries, cached per type name:

1. **Bootstrap** once — yields all 160 resources and the name of each one's `where` input type.
2. **Drill** on demand — when the user selects `pokemon`, fetch `pokemon_bool_exp`. When they cross into `pokemonstats`, fetch `pokemonstat_bool_exp`. At most once per type per session.
3. **Operators** on demand — one fetch per scalar comparison type, shared by every field of that type.

The deep reaches of a 4301-type schema are never fetched. `buildClientSchema` is **not** used for the catalog; `graphql`'s AST builders and `print()` are still used for query construction, which needs no schema object.

### Reading a `_bool_exp` — verified structure

`pokemon_bool_exp` has 42 members. Classification rules, all confirmed against the live endpoint:

| Member shape | Meaning |
|---|---|
| `_and: [T_bool_exp]`, `_or: [T_bool_exp]`, `_not: T_bool_exp` | Structural. Skipped by the catalog; produced by the compiler. |
| `name: String_comparison_exp` | **Scalar field.** Its operator list is that comparison type's own input fields. |
| `pokemonstats: pokemonstat_bool_exp` **with** a `pokemonstats_aggregate` sibling | **To-many relation.** |
| `pokemonspecy: pokemonspecies_bool_exp` **without** an `_aggregate` sibling | **To-one relation.** |
| `pokemonmoves_aggregate: pokemonmove_aggregate_bool_exp` | **Relation aggregate predicate.** |

Cardinality comes from the `_aggregate` sibling test alone. Pairing a `_bool_exp` with its output object type is unnecessary.

Operators are never hardcoded. `Int_comparison_exp` yields nine (`_eq`, `_gt`, `_gte`, `_in`, `_is_null`, `_lt`, `_lte`, `_neq`, `_nin`); `String_comparison_exp` yields nineteen, adding `_like`, `_ilike`, `_regex`, `_similar` and their negations. The rule editor offers whatever the field's comparison type declares.

Relation aggregate predicates on this deployment expose `count` only — `pokemonmove_aggregate_bool_exp` has exactly one member. So count-based relation filters ("learns more than 50 moves") are available and relation-average filters are not. That is decided by introspection at runtime, not by this document.

The schema graph is cyclic (`pokemon` -> `pokemonstats` -> `pokemon`), so the walk is lazy and depth-guarded by construction: nothing expands until the user drills into it.

### The dialect seam

Three conventions above are Hasura's, not GraphQL's: the `_bool_exp` suffix pairing, the `_comparison_exp` operator container, and the `_aggregate` sibling cardinality test. All three live in `core/dialect/` behind one interface. Pointing the builder at a differently shaped server is a new dialect implementation, not a rewrite.

### The overlay

A plain object behind an injection token, entirely optional: display labels, hidden field paths, pinned fields, per-resource default selection sets, and value-picker hints (a type name renders as a chip picker rather than a text box).

**The overlay can only affect what is pleasant, never what is possible.** Introspection remains the sole authority on what can be filtered. A stale overlay degrades presentation; it cannot produce an invalid query or hide a capability from the compiler.

## The compiler

A pure function. No Angular, no network, no clock.

```ts
interface CompileRequest {
	readonly resourceName: string;
	readonly filter: FilterGroup;
	readonly selection: SelectionNode;
	readonly ordering: readonly FieldOrdering[];
	readonly limit: number;
	readonly resolvedValues: ReadonlyMap<string, LiteralValue>;
}

compileQuery(request: CompileRequest): CompileResult;
```

`resolvedValues` is keyed by the derived variable name produced in phase one. An empty map with subqueries present yields `incomplete`, never a query with a dangling variable.

**Phase one — collect and resolve.** Walk the tree for `source: 'subquery'` operands, deduplicate structurally identical ones, and emit a single document with one alias per distinct subquery — exactly the `ResolveOperands` shape validated above. The host executes it and returns the values. Each subquery gets a derived, stable variable name.

**Phase two — compile.** Walk the tree into a `where` AST, walk the selection into a selection set, print. Groups become `_and` / `_or` arrays, `negated` wraps in `_not`, `relationScope` nests children inside the relation object.

**The compiler never throws on a half-built query.** It returns a discriminated result:

```ts
type CompileResult =
	| { readonly status: 'complete'; readonly document: string; readonly variables: Record<string, unknown> }
	| { readonly status: 'incomplete'; readonly issues: readonly CompileIssue[] };
```

A rule mid-edit degrades the preview instead of exploding the UI, and each issue names the `nodeId` it came from so the UI can point at it.

### Type coercion

`avg` returns a Float; `base_stat` is an Int. `_gt: $value` with a Float variable against an Int column is a Hasura type error. Resolved values are coerced to the compared column's declared type, and **the resolved value is displayed in the rule chip** (`> 72 — average Speed`). Rounding is never invisible.

## The UI

`signalStore` from `@ngrx/signals` owns the session: catalog, tree, selection, resolved values, compile result, saved queries. Signal Forms binds the tree with a recursive schema, and validation lives there — rule incomplete, operator not valid for the field's type, subquery missing its selector — so `status: 'incomplete'` and the field-level errors come from one source of truth.

Components:

| Component | Responsibility |
|---|---|
| `query-builder` | Shell: resource selection, the root group, the preview |
| `filter-group` | Recursive: AND/OR toggle, NOT flag, relation scope, children |
| `filter-rule` | Field path, operator, operand |
| `operand-editor` | Literal or subquery, and the switch between them |
| `field-path-picker` | Lazy CDK-overlay drill-down driven by the catalog |
| `selection-editor` | The returned field tree |
| `query-preview` | The printed document and its variables |

Editing model is the nested group tree — a direct structural match for `_and` / `_or` / `_not`, so the compiler is a straight walk with no normalisation step. Styling uses `ui-pokedex` tokens, CDK for overlays and drag-to-reparent, per the `pokedex-component` skill. Standalone, `OnPush`, signal inputs throughout.

### Projection

Each resource gets a default selection set from the overlay. The user can open a field tree and add or remove fields, including one level into relations. **Result columns are derived from the selection**, so the AG Grid column definitions follow the query rather than being hand-maintained alongside it.

## Error handling

| Failure | Behaviour |
|---|---|
| Bootstrap introspection fails or endpoint unreachable | Blocked shell with the endpoint and the error, not a blank builder |
| A drill fetch fails | That branch shows as unavailable; the rest of the builder keeps working |
| Subquery resolves to no row, or to null | The owning rule is marked unresolved and compilation reports `incomplete` naming that `nodeId` |
| Rule incomplete mid-edit | Preview degrades; no throw |
| Catalog walk depth exceeded | Guarded; deeper drilling is refused with an explanation |

## Testing

Jest 30, per workspace standard.

- **Compiler** — table-driven: model in, expected printed document and variables out. The validated headline query is the first case; each row of the subquery table is a case; `relationScope`, `negated`, nested groups, and `incomplete` results each get cases.
- **Catalog** — runs against a **trimmed introspection fixture** committed to the repo, generated from the live endpoint and cut to the handful of types the tests exercise. Not the 7.5 MB blob. This makes the classification rules tested against real schema shapes rather than against assumptions.
- **Components** — `@ngneat/spectator`, already a dev dependency.
- **Resolution phase** — tested with a stubbed fetcher; the core library never opens a socket in tests.

## Known risk

**Signal Forms with a recursive schema is the least-trodden corner of an experimental API.** Angular 22 exposes `@angular/forms/signals`, and the user has asked for signal forms specifically. Binding a nested, arbitrarily deep, dynamically reparented tree through a self-referencing schema is not a well-worn path.

**Mitigation:** the first implementation step is a spike proving a self-referencing schema binds a nested tree, before any UI is built on the assumption. **Documented fallback:** the tree lives in the `signalStore` and Signal Forms owns each rule editor leaf, where its validation and binding are on solid ground. Discovering this in step one costs an hour; discovering it in step nine costs the UI layer.

## Out of scope for the first release

- Percentile and other non-native statistics.
- The `every` relation quantifier. `some` and `none` cover the realistic cases and map to one nesting and one `_not` respectively; `every` requires the double-negation form `_not: { relation: { _not: { ... } } }`, which is cheap to add later but easy to get subtly wrong and hard for a user to reason about in a first release.
- Nested resolution waves (a subquery whose filter contains another subquery).
- Mutations. The target is a read-only exploration surface.
- Dialects other than Hasura. The seam exists; a second implementation does not.
- Server-side persistence of saved queries. URL serialization only.
