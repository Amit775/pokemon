import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type { ColDef, GetRowIdFunc, RowClassRules, StateUpdatedEvent } from 'ag-grid-community';
import {
	ButtonComponent,
	EntityPortraitComponent,
	POKEMON_TYPES,
	PokemonCardComponent,
	SearchSelectComponent,
	type SearchSelectOption,
	SectionHeadingComponent,
	StatBarComponent,
	TypeChipComponent,
	UiCardComponent,
	UiDataGridComponent,
	UiSkeletonComponent,
	UiTabsComponent,
} from '@pokemon-center/ui-pokedex';

interface KitMove {
	name: string;
	type: string;
	power: number;
	accuracy: number;
}

/**
 * Module scope, not a component field — the shape consumers should copy, since a fresh array on
 * each change detection resets grid state (column order, sizing, sort, filters).
 *
 * The `actions` column carries an explicit `valueGetter` because there is no field for it, and it
 * exercises the non-sortable, non-filterable header path. It also starts `hide: true`, so the
 * side bar's Columns panel has a hidden column worth revealing — the whole reason this demo grid
 * keeps its side bar on while the roster grid below turns it off.
 */
const moveColumns: ColDef<KitMove>[] = [
	{ field: 'name', headerName: 'Move', flex: 2, minWidth: 160, filter: 'agTextColumnFilter' },
	{ field: 'type', headerName: 'Type', width: 120, filter: 'agSetColumnFilter' },
	{ field: 'power', headerName: 'Power', width: 100, type: 'numericColumn', filter: 'agNumberColumnFilter' },
	{ field: 'accuracy', headerName: 'Accuracy', width: 110, type: 'numericColumn' },
	{ colId: 'actions', headerName: 'Actions', width: 110, valueGetter: () => 'add', sortable: false, filter: false, hide: true },
];

interface KitRoster {
	id: number;
	name: string;
	generation: number;
	power: number;
}

/** Module scope for the same reason as `moveColumns` above. */
const rosterColumns: ColDef<KitRoster>[] = [
	{ field: 'name', headerName: 'Name', flex: 2, minWidth: 200, filter: 'agTextColumnFilter' },
	{ field: 'generation', headerName: 'Generation', width: 130, type: 'numericColumn', filter: 'agSetColumnFilter' },
	{ field: 'power', headerName: 'Power', width: 110, type: 'numericColumn', filter: 'agNumberColumnFilter' },
];

/** 1,200 synthetic rows — in the neighborhood of the real Pokédex's 1,351, for an honest demo of virtualization. */
function buildKitRoster(): KitRoster[] {
	return Array.from({ length: 1200 }, (_, index) => ({
		id: index + 1,
		name: `Roster Mon ${index + 1}`,
		generation: (index % 9) + 1,
		power: 30 + ((index * 7) % 140),
	}));
}

/** Living demo of the ui-pokedex kit — eyeball every component in both themes. */
@Component({
	standalone: true,
	selector: 'pokedex-kit',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		TypeChipComponent,
		StatBarComponent,
		PokemonCardComponent,
		EntityPortraitComponent,
		UiCardComponent,
		SectionHeadingComponent,
		UiSkeletonComponent,
		UiTabsComponent,
		ButtonComponent,
		UiDataGridComponent,
		SearchSelectComponent,
	],
	template: `
		<div class="kit">
			<h1>ui-pokedex kit</h1>

			<pokedex-section-heading label="Buttons" />
			<div class="row">
				<button pokedex-button type="button">Default</button>
				<button pokedex-button="primary" type="button">Primary</button>
				<button pokedex-button type="button" disabled>Disabled</button>
				<a pokedex-button href="#buttons">Anchor</a>
			</div>

			<pokedex-section-heading label="Type chips" />
			<div class="row">
				@for (t of types; track t) {
					<pokedex-type-chip [type]="t" />
				}
			</div>

			<pokedex-section-heading label="Pokemon cards" />
			<div class="grid">
				<pokedex-pokemon-card pokedexNumber="006" name="Charizard" [types]="['fire', 'flying']" [selected]="true" />
				<pokedex-pokemon-card pokedexNumber="001" name="Bulbasaur" [types]="['grass', 'poison']" />
				<pokedex-pokemon-card pokedexNumber="025" name="Pikachu" [types]="['electric']" />
				<pokedex-pokemon-card pokedexNumber="094" name="Gengar" [types]="['ghost', 'poison']" />
			</div>

			<pokedex-section-heading label="Card + portrait + stat bars" />
			<pokedex-card>
				<div class="detail">
					<pokedex-entity-portrait type="fire" [size]="120" />
					<div class="stats">
						<pokedex-tabs [tabs]="tabs" [(value)]="tab" />
						@if (tab() === 'stats') {
							<pokedex-stat-bar label="HP" [value]="78" type="fire" />
							<pokedex-stat-bar label="Attack" [value]="84" type="fire" />
							<pokedex-stat-bar label="Defense" [value]="78" type="fire" />
							<pokedex-stat-bar label="Sp. Atk" [value]="109" type="fire" />
							<pokedex-stat-bar label="Sp. Def" [value]="85" type="fire" />
							<pokedex-stat-bar label="Speed" [value]="100" type="fire" />
						} @else {
							<p>Tab content for “{{ tab() }}”.</p>
						}
					</div>
				</div>
			</pokedex-card>

			<pokedex-section-heading label="Data table" />
			<pokedex-data-grid
				[rowData]="moveRows"
				[columnDefs]="moveColumns"
				[getRowId]="getMoveRowId"
				[rowClassRules]="moveRowClassRules"
				(stateUpdated)="onMoveGridStateUpdated($event)"
			/>
			<p class="sort-readout">
				Sort state, owned out here rather than inside the table: <strong>{{ sortDescription() }}</strong>
			</p>

			<pokedex-section-heading label="Data table — virtualized, filtered" />
			<pokedex-data-grid [rowData]="rosterRows" [columnDefs]="rosterColumns" [getRowId]="getRosterRowId" [sideBar]="false" />

			<pokedex-section-heading label="Search select" />
			<div class="row">
				<pokedex-search-select
					[options]="searchSelectOptions"
					[value]="searchSelectValue()"
					placeholder="Choose a resource"
					(valueChosen)="searchSelectValue.set($event)"
				/>
				<p>Chosen: <strong>{{ searchSelectValue() ?? 'none' }}</strong></p>
			</div>

			<pokedex-section-heading label="Skeletons" />
			<div class="skel">
				<pokedex-skeleton width="120px" height="120px" radius="50%" />
				<div style="flex:1; display:flex; flex-direction:column; gap:.5rem">
					<pokedex-skeleton width="40%" height="1.4rem" />
					<pokedex-skeleton width="70%" />
					<pokedex-skeleton width="60%" />
				</div>
			</div>
		</div>
	`,
	styles: `
		:host {
			display: block;
			height: calc(100vh - 60px);
			overflow-y: auto;
		}
		.kit {
			padding: var(--s-5);
			max-width: 60rem;
		}
		h1 {
			color: var(--ink);
		}
		.row {
			display: flex;
			flex-wrap: wrap;
			gap: var(--s-2);
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
			gap: var(--s-3);
		}
		.detail {
			display: flex;
			gap: var(--s-5);
			align-items: center;
			padding: var(--s-5);
		}
		.stats {
			flex: 1;
		}
		.stats pokedex-tabs {
			margin-bottom: var(--s-3);
		}
		p {
			color: var(--ink-muted);
		}
		.skel {
			display: flex;
			gap: var(--s-4);
			align-items: center;
		}
		.sort-readout {
			font-size: var(--fs-xs);
		}
		pokedex-data-grid {
			--pokedex-grid-height: 20rem;
		}

		/*
		 * AG Grid builds its row DOM outside Angular's template compiler, so an emulated-encapsulation
		 * rule never matches it — same \`::ng-deep\` escape hatch \`pokemon-shell.component.scss\` uses
		 * for its own \`rowClassRules\`-driven row.
		 */
		::ng-deep .ag-row.marked {
			background: var(--surface-sunken);
		}
	`,
})
export class KitComponent {
	protected readonly types = POKEMON_TYPES;
	protected readonly tabs = [
		{ label: 'About', value: 'about' },
		{ label: 'Stats', value: 'stats' },
		{ label: 'Moves', value: 'moves' },
	];
	protected readonly tab = signal('stats');

	protected readonly searchSelectOptions: readonly SearchSelectOption[] = [
		{ value: 'pokemon', label: 'Pokémon', group: 'Core' },
		{ value: 'move', label: 'Move', group: 'Core' },
		{ value: 'ability', label: 'Ability', group: 'Core' },
		{ value: 'berry', label: 'Berry', group: 'Items' },
		{ value: 'berryflavor', label: 'Berry Flavor', group: 'Items' },
	];
	protected readonly searchSelectValue = signal<string | null>(null);

	protected readonly moveColumns = moveColumns;
	protected readonly rosterColumns = rosterColumns;
	protected readonly rosterRows: KitRoster[] = buildKitRoster();

	protected readonly moveRows: KitMove[] = [
		{ name: 'Flamethrower', type: 'Fire', power: 90, accuracy: 100 },
		{ name: 'Aerial Ace', type: 'Flying', power: 60, accuracy: 100 },
		{ name: 'Thunderbolt', type: 'Electric', power: 90, accuracy: 100 },
		{ name: 'Ember', type: 'Fire', power: 40, accuracy: 100 },
		{ name: 'Focus Blast', type: 'Fighting', power: 120, accuracy: 70 },
	];

	/** Move names are unique across this demo's fixed five rows — a genuine identity, not just an index. */
	protected readonly getMoveRowId: GetRowIdFunc<KitMove> = (params) => params.data.name;
	protected readonly getRosterRowId: GetRowIdFunc<KitRoster> = (params) => params.data.id.toString();

	/** One marked row, so the kit's only row modifier is visible in both themes. */
	protected readonly moveRowClassRules: RowClassRules<KitMove> = {
		marked: (params) => params.data != null && params.data.accuracy < 100,
	};

	/**
	 * The grid owns its own sort state; this signal is a read-out fed by `stateUpdated`, not a
	 * two-way binding — there is no such input to bind to. A bare signal here; a real surface backs
	 * the same idea with a store. The grid cannot tell.
	 */
	protected readonly moveSort = signal<StateUpdatedEvent<KitMove>['state']['sort']>(undefined);

	protected onMoveGridStateUpdated(event: StateUpdatedEvent<KitMove>): void {
		this.moveSort.set(event.state.sort);
	}

	/** A computed, not a method: a template-called method re-runs on every change detection. */
	protected readonly sortDescription = computed(() => {
		const [entry] = this.moveSort()?.sortModel ?? [];
		if (!entry) return 'none';
		return `${entry.colId} ${entry.sort === 'desc' ? 'descending' : 'ascending'}`;
	});
}
