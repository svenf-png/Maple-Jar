import type { ConflictRow } from '../../data/db';
import { parseHlc } from '../../data/events/hlc';

export interface Version {
  /** Ereignis, das die Version geschrieben hat (Schlüssel). */
  eventId: string;
  author: string;
  /** Wanduhrzeit der HLC (ms). */
  at: number;
  /** Wert je strittigem Feld (fehlt die Version bei einem Feld, gilt der aktuelle Zeilenwert). */
  values: Record<string, unknown>;
}

/** Felder, die nur den Kurs begleiten und nicht einzeln angezeigt werden. */
export const HIDDEN_FIELDS: ReadonlySet<string> = new Set(['fxRateDate', 'fxProvisional']);

/** Versionen eines Feld-Konflikts, älteste zuerst; Versionen mit gleichen Werten werden zusammengefasst. */
export function versionsOf(conflict: ConflictRow, row: Record<string, unknown>): Version[] {
  const byEvent = new Map<string, Version>();
  for (const f of conflict.fields) {
    for (const c of f.candidates) {
      const v = byEvent.get(c.eventId) ?? {
        eventId: c.eventId,
        author: c.author,
        at: parseHlc(c.hlc)?.ms ?? 0,
        values: {},
      };
      v.values[f.field] = c.value;
      byEvent.set(c.eventId, v);
    }
  }
  const all = [...byEvent.values()].map((v) => ({
    ...v,
    values: Object.fromEntries(
      conflict.fields.map((f) => [f.field, f.field in v.values ? v.values[f.field] : row[f.field]]),
    ),
  }));
  all.sort((a, b) => a.at - b.at || (a.eventId < b.eventId ? -1 : 1));
  const unique = new Map<string, Version>();
  for (const v of all) unique.set(JSON.stringify(v.values), v);
  return [...unique.values()].sort((a, b) => a.at - b.at);
}

/** Felder, in denen sich die Versionen unterscheiden (ohne ausgeblendete). */
export const differingFields = (conflict: ConflictRow, versions: readonly Version[]): string[] =>
  conflict.fields
    .map((f) => f.field)
    .filter(
      (f) =>
        !HIDDEN_FIELDS.has(f) && new Set(versions.map((v) => JSON.stringify(v.values[f]))).size > 1,
    );
