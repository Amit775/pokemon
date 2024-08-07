import { type } from '@ngrx/signals';
import { Move } from 'pokenode-ts';
import { withQueryableEntitiesFeature } from './queryable-entities-feature';

export const withMovesFeature = () =>
  withQueryableEntitiesFeature({ entity: type<Move>(), collection: 'moves' });
