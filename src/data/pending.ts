import { db as defaultDb, type MapleJarDb } from './db';
import { useLiveQuery } from './use-live-query';

/** Schlüssel `entity:rowId` aller Zeilen, deren Ereignis noch in der Outbox wartet. */
export async function pendingRowKeys(db: MapleJarDb): Promise<Set<string>> {
  const ids = (await db.outbox.toCollection().primaryKeys()) as string[];
  const events = await db.events.bulkGet(ids);
  const keys = new Set<string>();
  for (const e of events) {
    if (e) keys.add(`${e.entity}:${e.rowId}`);
  }
  return keys;
}

const EMPTY: ReadonlySet<string> = new Set();

/** Live-Liste der wartenden Zeilen (liest aus `outbox` und `events`). */
export function usePendingRows(): ReadonlySet<string> {
  return useLiveQuery(() => pendingRowKeys(defaultDb), [], EMPTY);
}
