import type { ConflictEntity } from '../../data/conflict-actions';
import { type ConflictRow, db } from '../../data/db';
import { useLiveQuery } from '../../data/use-live-query';

/** Live: der offene Konflikt einer Zeile oder `undefined`. */
export const useConflict = (entity: ConflictEntity, rowId: string): ConflictRow | undefined =>
  useLiveQuery(() => db.conflicts.get(`${entity}:${rowId}`), [entity, rowId], undefined);
