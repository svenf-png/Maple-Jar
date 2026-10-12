import type { MapleJarDb } from './db';

/** Alle bekannten Ereignisse als JSON-Text (lokal erzeugt, kein Upload). Sortiert nach HLC. */
export async function exportEventsJson(db: MapleJarDb, now: Date = new Date()): Promise<string> {
  const events = await db.events.orderBy('hlc').toArray();
  return JSON.stringify({ format: 1, exportedAt: now.toISOString(), events }, null, 2);
}
