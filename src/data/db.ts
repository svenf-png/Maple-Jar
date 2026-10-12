import Dexie, { type EntityTable } from 'dexie';
import type { RowConflict } from './events/fold';
import type { Entity } from './events/schema';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Gespeichertes Ereignis (eigene und fremde). `seq` nur bei Ereignissen vom Server. */
export interface EventRow {
  id: string;
  hlc: string;
  entity: Entity;
  rowId: string;
  device: string;
  author: string;
  op: string;
  base: string[];
  v: number;
  data?: Record<string, unknown>;
  seq?: number;
}

export interface OutboxRow {
  id: string;
}

export interface ConflictRow extends RowConflict {
  /** `entity:rowId` */
  id: string;
  entity: Entity;
  rowId: string;
}

/** Ungültiges oder nicht lesbares Ereignis: wird angezeigt, nie still verworfen. */
export interface ParkedRow {
  key: string;
  seq: number | null;
  reason: string;
  /** Nur Kennungen, keine Nutzdaten. */
  eventId: string | null;
  at: string;
}

/** Materialisierte Zeile: Felder der Entität flach, dazu Verwaltungsfelder. */
export type MaterialRow = {
  id: string;
  deleted: boolean;
  hlc: string;
  createdBy: string;
  createdByDevice: string;
  conflict: boolean;
} & Record<string, unknown>;

const LEGACY_META_KEYS = ['token', 'repo', 'login', 'householdSha', 'household'];

export class MapleJarDb extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  events!: EntityTable<EventRow, 'id'>;
  outbox!: EntityTable<OutboxRow, 'id'>;
  conflicts!: EntityTable<ConflictRow, 'id'>;
  parked!: EntityTable<ParkedRow, 'key'>;
  settings!: EntityTable<MaterialRow, 'id'>;
  member!: EntityTable<MaterialRow, 'id'>;
  category!: EntityTable<MaterialRow, 'id'>;
  entry!: EntityTable<MaterialRow, 'id'>;
  budget!: EntityTable<MaterialRow, 'id'>;

  constructor(name = 'maple-jar') {
    super(name);
    this.version(1).stores({ meta: 'key' });
    this.version(2)
      .stores({
        meta: 'key',
        events: 'id, [entity+rowId], hlc',
        outbox: 'id',
        conflicts: 'id, entity',
        parked: 'key',
        settings: 'id',
        member: 'id',
        category: 'id, sort',
        entry: 'id, bookedOn, categoryId, deleted',
        budget: 'id, categoryId, validFrom',
      })
      .upgrade(async (tx) => {
        // Reste der GitHub-Anbindung aus M1 entfernen; Anzeige- und Hilfswerte bleiben erhalten.
        await tx.table('meta').bulkDelete(LEGACY_META_KEYS);
      });
  }
}

export const db = new MapleJarDb();

export const getMeta = async <T>(key: string, store: MapleJarDb = db): Promise<T | undefined> =>
  (await store.meta.get(key))?.value as T | undefined;

export const setMeta = async (
  key: string,
  value: unknown,
  store: MapleJarDb = db,
): Promise<void> => {
  await store.meta.put({ key, value });
};
