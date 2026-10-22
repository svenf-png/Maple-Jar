import { type CsvInput, entriesToCsv } from '../domain/csv';
import { toCategory, toEntry } from '../domain/model';
import type { MapleJarDb } from './db';

/** Alle bekannten Ereignisse als JSON-Text (lokal erzeugt, kein Upload). Sortiert nach HLC. */
export async function exportEventsJson(db: MapleJarDb, now: Date = new Date()): Promise<string> {
  const events = await db.events.orderBy('hlc').toArray();
  return JSON.stringify({ format: 1, exportedAt: now.toISOString(), events }, null, 2);
}

/** Alle Einträge als CSV-Text (ohne gelöschte, siehe `entriesToCsv`). */
export async function exportEntriesCsv(
  db: MapleJarDb,
  members: CsvInput['members'],
  labels: CsvInput['labels'],
): Promise<string> {
  const [rows, cats] = await Promise.all([db.entry.toArray(), db.category.toArray()]);
  return entriesToCsv({
    entries: rows.map(toEntry),
    categories: cats.map(toCategory),
    members,
    labels,
  });
}
