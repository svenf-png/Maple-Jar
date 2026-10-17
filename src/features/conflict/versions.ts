import { MONEY_GROUPS } from '../../data/conflict-actions';
import type { ConflictRow, EventRow } from '../../data/db';
import { compareHlc, parseHlc } from '../../data/events/hlc';

export interface Version {
  /** Ereignis, das die Version geschrieben hat (Schlüssel). */
  eventId: string;
  author: string;
  /** Wanduhrzeit der HLC (ms). */
  at: number;
  /** Wert je Feld der Version (strittige Felder und der zugehörige Geldsatz), jeweils aus der Vorgeschichte des jüngsten Kopfes dieser Seite. */
  values: Record<string, unknown>;
}

/** Felder, die nur den Kurs begleiten und nicht einzeln angezeigt werden. */
export const HIDDEN_FIELDS: ReadonlySet<string> = new Set(['fxRateDate', 'fxProvisional']);

/**
 * Felder, die eine Version trägt: die strittigen Felder; ist ein Mitglied des Geldsatzes (Betrag, Währung, Kurs)
 * strittig, gehört der ganze Satz dazu (sonst würde z. B. ein Betrag mit der Währung der anderen Version gezeigt).
 */
export function conflictFields(conflict: ConflictRow): string[] {
  const names = conflict.fields.map((f) => f.field);
  const group = MONEY_GROUPS[conflict.entity as keyof typeof MONEY_GROUPS] ?? [];
  if (!names.some((n) => group.includes(n))) return names;
  return [...group, ...names.filter((n) => !group.includes(n))];
}

/** Jüngster Wert eines Feldes in der Vorgeschichte eines Ereignisses (einschließlich ihm selbst). */
function lineageValue(
  byId: ReadonlyMap<string, EventRow>,
  heads: string | readonly string[],
  field: string,
): { found: true; value: unknown } | { found: false } {
  const seen = new Set<string>();
  const stack = typeof heads === 'string' ? [heads] : [...heads];
  let best: EventRow | undefined;
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const e = byId.get(id);
    if (!e) continue;
    stack.push(...e.base);
    if ((e.op === 'create' || e.op === 'update') && e.data && field in e.data) {
      if (!best || compareHlc(e.hlc, best.hlc) > 0) best = e;
    }
  }
  return best?.data ? { found: true, value: best.data[field] } : { found: false };
}

/** Alle Vorgänger-IDs eines Ereignisses (einschließlich ihm selbst). */
function ancestry(byId: ReadonlyMap<string, EventRow>, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(byId.get(cur)?.base ?? []));
  }
  return seen;
}

/**
 * Jüngster Kopf (Ereignis, das in keiner `base` einer anderen vorkommt) der Zeile, dessen Vorgeschichte das Kandidaten-
 * Ereignis enthält; das Kandidaten-Ereignis ist der letzte Schreiber des strittigen Feldes, nicht der Kopf der Seite.
 */
function headOf(
  events: readonly EventRow[],
  byId: ReadonlyMap<string, EventRow>,
  id: string,
): string {
  const referenced = new Set(events.flatMap((e) => e.base));
  let best: EventRow | undefined;
  for (const e of events) {
    if (referenced.has(e.id) || !ancestry(byId, e.id).has(id)) continue;
    if (!best || compareHlc(e.hlc, best.hlc) > 0) best = e;
  }
  return best?.id ?? id;
}

/**
 * Versionen eines Feld-Konflikts, älteste zuerst. Versionen, die sich in keinem sichtbaren Feld unterscheiden,
 * werden zusammengefasst (die jüngste bleibt). `events`: die Ereignisse der Zeile (für die Vorgeschichte je Version).
 */
export function versionsOf(
  conflict: ConflictRow,
  row: Record<string, unknown>,
  events: readonly EventRow[] = [],
): Version[] {
  const fields = conflictFields(conflict);
  const byId = new Map(events.map((e) => [e.id, e]));
  const heads = new Map<string, Omit<Version, 'values'> & { direct: Record<string, unknown> }>();
  for (const f of conflict.fields) {
    for (const c of f.candidates) {
      const v = heads.get(c.eventId) ?? {
        eventId: c.eventId,
        author: c.author,
        at: parseHlc(c.hlc)?.ms ?? 0,
        direct: {},
      };
      v.direct[f.field] = c.value;
      heads.set(c.eventId, v);
    }
  }
  const all: Version[] = [...heads.values()].map(({ direct, ...v }) => ({
    ...v,
    values: Object.fromEntries(
      fields.map((f) => {
        const own = lineageValue(byId, headOf(events, byId, v.eventId), f);
        return [f, own.found ? own.value : f in direct ? direct[f] : row[f]];
      }),
    ),
  }));
  all.sort((a, b) => a.at - b.at || (a.eventId < b.eventId ? -1 : 1));
  const visible = fields.filter((f) => !HIDDEN_FIELDS.has(f));
  const unique = new Map<string, Version>();
  for (const v of all) unique.set(JSON.stringify(visible.map((f) => v.values[f])), v);
  return [...unique.values()].sort((a, b) => a.at - b.at);
}

/** Felder, in denen sich die Versionen unterscheiden (ohne ausgeblendete). */
export const differingFields = (conflict: ConflictRow, versions: readonly Version[]): string[] =>
  conflictFields(conflict).filter(
    (f) =>
      !HIDDEN_FIELDS.has(f) && new Set(versions.map((v) => JSON.stringify(v.values[f]))).size > 1,
  );

/**
 * Was „diese Version behalten“ schreibt: nur die strittigen Felder des Konflikts; der ganze Geldsatz nur, wenn ein
 * Mitglied davon sichtbar abweicht (sonst würde ein Auto-Auflösen gleichzeitige Betragsänderungen überschreiben).
 */
export function keptValues(
  conflict: ConflictRow,
  version: Version,
  versions: readonly Version[],
): Record<string, unknown> {
  const group = MONEY_GROUPS[conflict.entity as keyof typeof MONEY_GROUPS] ?? [];
  if (differingFields(conflict, versions).some((f) => group.includes(f))) return version.values;
  const names = new Set(conflict.fields.map((f) => f.field));
  return Object.fromEntries(Object.entries(version.values).filter(([k]) => names.has(k)));
}

/** Auto-Auflösen erst, wenn die Ereignisse geladen sind und keine Version sich sichtbar unterscheidet. */
export const shouldAutoResolve = (
  events: readonly EventRow[] | undefined,
  shown: readonly string[],
): boolean => events !== undefined && shown.length === 0;

export interface Edit {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Löschen gegen Bearbeiten: was die gleichzeitige Bearbeitung geändert hat (Feld, Wert davor, Wert danach).
 * Nur Felder, deren Wert sich tatsächlich unterscheidet; „davor“ ist der Stand der Vorgeschichte der Bearbeitung.
 */
export function editsOf(conflict: ConflictRow, events: readonly EventRow[]): Edit[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const edits = new Map<string, Edit>();
  for (const e of events) {
    if (!conflict.eventIds.includes(e.id) || e.op !== 'update' || !e.data) continue;
    for (const [field, after] of Object.entries(e.data)) {
      const found = lineageValue(byId, e.base, field);
      const before = found.found ? found.value : undefined;
      if (JSON.stringify(before) !== JSON.stringify(after))
        edits.set(field, { field, before, after });
    }
  }
  return [...edits.values()];
}
