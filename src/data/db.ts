import Dexie, { type EntityTable } from 'dexie';

export interface MetaRow {
  key: string;
  value: unknown;
}

class MapleJarDb extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('maple-jar');
    // Weitere Tabellen kommen ab M2 per Versionsmigration.
    this.version(1).stores({ meta: 'key' });
  }
}

export const db = new MapleJarDb();

export const getMeta = async <T>(key: string): Promise<T | undefined> =>
  (await db.meta.get(key))?.value as T | undefined;

export const setMeta = async (key: string, value: unknown): Promise<void> => {
  await db.meta.put({ key, value });
};
