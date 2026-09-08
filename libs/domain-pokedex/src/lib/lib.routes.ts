import { Route } from '@angular/router';
import { provideDataGrid } from '@pokemon-center/ui-pokedex';
import { QUERY_BUILDER_ENDPOINT } from '@pokemon-center/ui-query-builder';

export const domainPokedexRoutes: Route[] = [
	{ path: '', redirectTo: 'pokemon', pathMatch: 'full' },
	{
		path: 'pokemon',
		// Route-scoped so AG Grid stays out of the eagerly loaded main bundle — the shell hosts the
		// grids rendered by its children.
		providers: [provideDataGrid()],
		loadComponent: () => import('./features/pokemon-shell/pokemon-shell.component').then((module) => module.PokemonShellComponent),
		children: [
			{ path: '', loadComponent: () => import('./features/pokemon-shell/pokemon-empty-detail.component').then((module) => module.PokemonEmptyDetailComponent) },
			{
				path: ':id',
				loadComponent: () => import('./features/pokemon-page/pokemon-page.component').then((module) => module.PokemonPageComponent),
				children: [
					{ path: '', redirectTo: 'about', pathMatch: 'full' },
					{ path: 'about', loadComponent: () => import('./features/pokemon-page/pokemon-about/pokemon-about.component').then((module) => module.PokemonAboutComponent) },
					{ path: 'stats', loadComponent: () => import('./features/pokemon-page/pokemon-stats/pokemon-stats.component').then((module) => module.PokemonStatsComponent) },
					{ path: 'moves', loadComponent: () => import('./features/pokemon-page/pokemon-moves/pokemon-moves.component').then((module) => module.PokemonMovesComponent) },
					{ path: 'locations', loadComponent: () => import('./features/pokemon-page/pokemon-locations/pokemon-locations.component').then((module) => module.PokemonLocationsComponent) },
				],
			},
		],
	},
	{ path: 'moves', loadComponent: () => import('./features/moves-list/moves-list.component').then((module) => module.MovesListComponent) },
	{
		path: 'moves/:id',
		loadComponent: () => import('./features/move-page/move-page.component').then((module) => module.MovePageComponent),
	},
	{
		path: 'abilities/:id',
		loadComponent: () => import('./features/ability-page/ability-page.component').then((module) => module.AbilityPageComponent),
	},
	{
		path: 'items/:id',
		loadComponent: () => import('./features/item-page/item-page.component').then((module) => module.ItemPageComponent),
	},
	{
		path: 'types/:id',
		loadComponent: () => import('./features/type-page/type-page.component').then((module) => module.TypePageComponent),
	},
	{
		path: 'analyzer',
		loadComponent: () => import('./features/analyzer/analyzer.component').then((module) => module.AnalyzerComponent),
	},
	{
		path: 'coverage',
		loadComponent: () => import('./features/coverage/coverage.component').then((module) => module.CoverageComponent),
	},
	{
		path: 'compare',
		loadComponent: () => import('./features/compare/compare.component').then((module) => module.CompareComponent),
	},
	{
		path: 'kit',
		providers: [provideDataGrid()],
		loadComponent: () => import('./features/kit/kit.component').then((module) => module.KitComponent),
	},
	{
		path: 'query-explorer',
		providers: [provideDataGrid(), { provide: QUERY_BUILDER_ENDPOINT, useValue: '/api/query-builder/graphql' }],
		loadComponent: () => import('./features/query-explorer/query-explorer.component').then((module) => module.QueryExplorerComponent),
	},
];
