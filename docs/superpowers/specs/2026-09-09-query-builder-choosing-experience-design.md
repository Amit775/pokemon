# Query Builder — The Choosing Experience — Design

**Status:** approved scope, ready for implementation plan.

**Builds on:** [2026-09-06-graphql-query-builder-design.md](2026-09-06-graphql-query-builder-design.md). That design produced a working compiler and a builder UI. This one is about everything the user has to *choose* along the way.

## Why

The compiler is right and the query it emits is right. The experience of composing that query is not.

Every choice the builder asks for is currently either a flat list of chips or a raw text box. The user is asked to know that a Pokémon's type lives at `pokemontypes.type.name`, to type `pokemonstats` correctly into a relation-scope box, and to read field names like `pokemonspeciesdescription`. That is the shape of the schema leaking through the interface.

Three things are wrong, and they compound:

1. **Nothing is searchable.** 160 resources render as a flat chip list. Finding `pokemonmove` means scanning.
2. **Nothing is named.** Raw schema identifiers reach the screen. `pokemonspecy` is not a word.
3. **The joins are the user's problem.** Filtering by type requires understanding a join table.

Fixing only the third would still leave an unusable list. Fixing only the first two would leave the user walking join tables with prettier labels. They go together.

**The goal: every resource, every path, every field and every non-primitive value is chosen from a searchable list of real names.**

## What the schema can and cannot tell us

Measured against the live Hasura PokeAPI deployment at `http://localhost:8080/v1/graphql`, not recalled.

| Measurement | Value |
|---|---|
| Leading resources | 160 |
| Resources carrying a GraphQL `description` | 160 |
| ...of which are useful | **0** |
| Total field slots across all resources | 1,279 |
| **Distinct** field names (174 scalar + 211 relation) | **385** |
| Fields on the `pokemon` output type | 39 (8 scalar, 16 relation) |

**Every description is Hasura boilerplate.** They read `fetch data from the table: "pokemon_v2_ability"` and `columns and relationships of "pokemon_v2_pokemon"`. There is no human-authored text anywhere in the schema. Display names cannot be derived; they must be supplied.

Row counts for candidate value sources, which differ by two orders of magnitude and shape the picker design:

| Resource | Rows | | Resource | Rows |
|---|---|---|---|---|
| `stat` | 9 | | `ability` | 374 |
| `generation` | 9 | | `move` | 937 |
| `egggroup` | 15 | | `pokemon` | 1,351 |
| `type` | 21 | | `item` | 2,223 |

## Architecture

### Placement

`libs/ui-query-builder` **stays generic**. It gains the metadata types, the label-lookup and fallback, the resolution logic and the UI. It learns nothing about Pokémon.

The curated map is domain data and lives in `libs/domain-pokedex/src/lib/query-metadata/`, supplied through the existing `QUERY_BUILDER_OVERLAY` injection token — renamed `QUERY_BUILDER_METADATA`, because "overlay" undersold it when it held four optional fields and badly undersells it now.

The searchable select is a design-system component and lives in `libs/ui-pokedex`.

### The metadata model

```ts
interface QueryBuilderMetadata {
	readonly resources: readonly ResourceMetadata[];
	readonly resourceLabels: Readonly<Record<string, string>>;
	readonly fieldLabels: Readonly<Record<string, string>>;
}

interface ResourceMetadata {
	readonly resourceName: string;
	readonly displayName: string;
	readonly group: string;
	readonly priority: number;
	readonly shortcuts: readonly FilterShortcut[];
	readonly defaultSelectionFieldNames?: readonly string[];
	readonly fieldLabelOverrides?: Readonly<Record<string, string>>;
}

interface FilterShortcut {
	readonly shortcutId: string;
	readonly displayName: string;
	readonly fieldPath: readonly string[];
	readonly scope?: RelationScopeTemplate;
	readonly valueSource?: ValueSource;
}

interface RelationScopeTemplate {
	readonly relationPath: readonly string[];
	readonly quantifier: 'some' | 'none';
	readonly pinnedRules: readonly PinnedRule[];
}

interface PinnedRule {
	readonly fieldPath: readonly string[];
	readonly operatorName: string;
	readonly value: LiteralValue;
}

interface ValueSource {
	readonly resourceName: string;
	readonly valueFieldName: string;
	readonly searchFieldName?: string;
}
```

### Shortcuts emit existing model nodes

A shortcut is a named filter that expands into the tree the compiler already understands. It introduces no new concept to the compiler and requires no compiler change.

| Shortcut | Expands to |
|---|---|
| Type | rule at `pokemontypes.type.name` |
| Ability | rule at `pokemonabilities.ability.name` |
| Learns move | rule at `pokemonmoves.move.name` |
| Base Speed | relation-scoped group on `pokemonstats`, pinned `stat.name _eq "speed"`, editable rule on `base_stat` |

Base Speed is why `scope` exists. Two conditions must hold on the **same** related row, which is exactly what `relationScope` in the filter tree was built for in the previous design. The user picks one thing called "Base Speed"; the builder inserts a two-rule scoped group, one rule pinned and one editable.

Pinned rules render as fixed context rather than as editable rules — the user should see *why* the group is scoped without being invited to break it.

**The raw graph stays reachable.** An "Advanced" affordance on the field picker exposes the full labelled relation graph, so nothing in the schema becomes unreachable. Shortcuts are the fast path, not the only path.

### Display names are a generated table, not an algorithm

**545 entries: 160 resource names and 385 distinct field names.** They are authored, committed data — not computed at runtime.

An algorithm was considered and rejected on evidence. Hasura disambiguates multiple foreign keys to the same table by generating names no string transform can decode:

```
PokemonspecyByPartySpeciesId    → "Party Species"
BerryflavorByLikesFlavorId      → "Liked Flavor"
TypeByTargetTypeId              → "Target Type"
ContestcombosBySecondMoveId     → "Second Move"
LanguageByLocalLanguageId       → "Language"
```

Those require knowing what the relationship *means*. Nor would a tokenizer recover `pokemonspecy` → "Species" (Hasura mis-singularising "species"), `hp` → "HP", or `pokedex` → "Pokédex". A curated table gets all of them right by construction.

The 3.3× reuse of field names across tables is what makes this affordable: 1,279 field slots collapse to 385 distinct names.

Two files:

- `resource-labels.ts` — 160 entries
- `field-labels.ts` — 385 entries

Labels are global by raw name, since `base_stat` reads correctly as "Base Stat" everywhere. `fieldLabelOverrides` on a resource handles the rare case where one column means different things in different tables.

**Resolution order, so the two sources cannot disagree:** a resource's display name comes from its `ResourceMetadata.displayName` when it is curated, and from `resourceLabels` otherwise. Curated resources appear in both — `resourceLabels` covers all 160 so the tail is never unlabelled, and `ResourceMetadata` exists only for the ~20 that also carry grouping, priority and shortcuts. A field's label comes from `fieldLabelOverrides` on the owning resource, then `fieldLabels`, then the title-case fallback.

**The fallback is deliberately dumb.** An unknown name gets plain title-casing. It exists so a field added to the schema tomorrow renders as *something*, and the drift test reports it as missing so it gets a real name. It is not a second naming strategy.

### Value pickers

One code path for every value input:

- **On focus** — query with an empty search and `limit: 50`. For `type` (21 rows) or `stat` (9) that shows the entire list without typing, which is how a small enum should behave.
- **On typing** — re-query with `_ilike` and a short debounce. `item` (2,223) and `move` (937) stay fast because only 50 rows ever cross the wire.

No preloading, no cache to invalidate, no size threshold to tune. Options render humanized (`razor-leaf` → "Razor Leaf") while the emitted value stays the raw slug the query needs.

A value input is a picker only when the metadata declares a `valueSource`. Numbers and free text stay plain inputs.

### The search-select primitive

`pokedex-search-select` in `libs/ui-pokedex`, built on CDK (`CdkListbox`, `CdkConnectedOverlay`, `CdkTrapFocus`) — already the pattern in `field-path-picker`. **Not Angular Material:** it is a dependency of this workspace but referenced in zero files, so adopting it here would set a new precedent for one component.

It is **presentational**. It takes `options`, `loading` and `groups` as signal inputs and emits a selection; it never fetches. One component therefore serves both the static cases (resources, fields, shortcuts) and the async ones (value pickers), with the caller owning where options come from.

Type-to-filter, arrow-key navigation, Enter to select, Escape to close, and a real `combobox` role with `aria-expanded`/`aria-haspopup` — which also settles an accessibility gap deferred from the previous round.

### The six sites

| Site | Today | Becomes |
|---|---|---|
| Resource picker (shell) | flat chips | grouped, priority-sorted, searchable |
| Rule field (`filter-rule`) | raw drill-down | shortcuts first; Advanced reveals the labelled graph |
| Relation scope (`filter-group`) | **free text** | path picker |
| Subquery resource + field (`operand-editor`) | **free text** | pickers |
| Selection editor | **free text** | field picker |
| Operand values (`operand-editor`) | free text | value picker when metadata declares a source |

Three of the six are raw text boxes today, which is most of why the surface reads as unfinished.

### The selection editor forces a new capability

Choosing output fields requires reading **output object types** (`__type(name: "pokemon") { fields }`). Everything the catalog reads today is *input* `bool_exp` types.

Adding an output-type reader to the catalog closes a gap disclosed on the previous design: the selection editor currently accepts unvalidated free text, and column derivation depends on the user typing field names correctly. This work closes it as a side effect rather than as a separate project.

### Resource grouping

Four groups, ordered; resources sorted by priority within each:

- **Core** — Pokémon, Move, Ability, Item, Type
- **Classification** — Species, Egg Group, Nature, Growth Rate, Characteristic
- **World** — Region, Location, Encounter, Version Group, Generation
- **Mechanics** — Stat, Machine, Evolution, Contest

The remaining ~140 resources appear under **Everything else**, alphabetical, searchable, labelled from the generated table. They are second-class in ordering only — fully usable, just not curated with shortcuts.

## Errors and edge cases

| Situation | Behaviour |
|---|---|
| Curated shortcut path no longer resolves | Hidden from the picker; the drift test fails the build naming it |
| Field name missing from the label table | Title-cased fallback; drift test reports it as uncovered |
| Value source query fails | Picker shows the error and stays open; the rule is not silently emptied |
| Value search returns nothing | "No matches" — distinct from a failed request |
| Resource changed after filters exist | Filter and selection both reset, as they are meaningless against a different resource |

That last row fixes a defect the previous review found: `selectResource` currently resets the filter but leaves the selection, producing a query that selects one resource's fields from another.

## Keeping it honest

The committed introspection fixture expands to cover the curated resources — now both their `bool_exp` inputs **and** their output types. The capture script already exists; its type list grows.

One test then walks every curated resource, every shortcut path (including the pinned conditions inside scopes), every value source and every label-table key, asserting each resolves against that fixture. A renamed column fails the build naming the exact shortcut, rather than surfacing as an empty dropdown weeks later.

The label tables get the same treatment in reverse: the test asserts every distinct name in the fixture has an entry, so the tables cannot silently fall behind the schema.

## Testing

- **Label tables** — every fixture name covered; fallback only fires for genuinely unknown names.
- **Shortcut expansion** — table-driven: shortcut in, expected filter-tree node out. Base Speed's scoped-group-with-pinned-rule is the case that matters.
- **Search-select** — keyboard navigation, filtering, grouping, empty and loading states, ARIA attributes.
- **Value pickers** — focus issues an empty-search query; typing debounces and re-queries; failure renders an error rather than an empty list. Network stubbed.
- **End-to-end through the DOM** — compose the headline query by *choosing* (resource, shortcut, value) and assert the printed document. The previous round's whole-branch review found four defects that survived sixteen task reviews precisely because no test drove the UI and inspected the output. That gap does not reopen here.

## Out of scope

- The subquery filter editor and aggregate selector. "Faster than Snorlax" remains non-composable through the UI; that is its own piece of work.
- Relation aggregate predicates ("learns more than 50 moves"), still unexpressible by the rule model.
- Curating shortcuts for the ~140 tail resources. They get labels and search, not hand-written shortcuts.
- Localised names. PokeAPI carries per-language name tables; everything here uses English slugs.
- Saved queries and URL serialisation.
