import { compareHlc } from './hlc';
import type { AppEvent, Entity } from './schema';

// Deterministischer Fold: gleiche Ereignismenge ergibt in jeder Reihenfolge dasselbe Ergebnis.
// Konflikte werden über `base` erkannt: zwei Schreibzugriffe sind gleichzeitig, wenn keiner den anderen kennt.

export interface FoldContext {
  hasCategory(id: string): boolean;
  hasMember(id: string): boolean;
}

export interface ConflictCandidate {
  eventId: string;
  value: unknown;
  hlc: string;
  author: string;
}

export interface RowConflict {
  kind: 'fields' | 'deleteVsEdit';
  /** Bei `fields`: je Feld die konkurrierenden Werte. Bei `deleteVsEdit` leer. */
  fields: Array<{ field: string; candidates: ConflictCandidate[] }>;
  eventIds: string[];
}

export interface FoldedRow {
  entity: Entity;
  id: string;
  fields: Record<string, unknown>;
  deleted: boolean;
  /** HLC des jüngsten angewendeten Ereignisses. */
  hlc: string;
  createdBy: string;
  createdByDevice: string;
  conflict: RowConflict | null;
}

export interface FoldRowResult {
  row: FoldedRow | null;
  /** IDs der Ereignisse, die auf eine noch fehlende Referenz oder Zeile warten. */
  waiting: string[];
}

/** Entitäten, bei denen gleichzeitige Änderungen am selben Feld einen Konflikt ergeben (sonst Last-Write-Wins). */
const CONFLICT_ENTITIES: ReadonlySet<Entity> = new Set(['entry']);

export const byHlc = (a: AppEvent, b: AppEvent): number =>
  compareHlc(a.hlc, b.hlc) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function refsMissing(e: AppEvent, ctx: FoldContext): boolean {
  const d = e.data;
  if (!d) return false;
  if (e.entity === 'entry' || e.entity === 'budget') {
    if (typeof d.categoryId === 'string' && !ctx.hasCategory(d.categoryId)) return true;
  }
  if (e.entity === 'entry' && typeof d.paidBy === 'string' && !ctx.hasMember(d.paidBy)) return true;
  return false;
}

/** Kennt-Relation: Menge aller Ereignis-IDs, die `e` (transitiv über `base`) kennt. */
function knowledge(events: AppEvent[]): Map<string, Set<string>> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const memo = new Map<string, Set<string>>();
  const visit = (id: string, stack: Set<string>): Set<string> => {
    const cached = memo.get(id);
    if (cached) return cached;
    const known = new Set<string>();
    const e = byId.get(id);
    if (e && !stack.has(id)) {
      stack.add(id);
      for (const b of e.base) {
        known.add(b);
        for (const k of visit(b, stack)) known.add(k);
      }
      stack.delete(id);
    }
    memo.set(id, known);
    return known;
  };
  for (const e of events) visit(e.id, new Set());
  return memo;
}

export function foldRow(
  entity: Entity,
  rowEvents: readonly AppEvent[],
  ctx: FoldContext,
): FoldRowResult {
  const unique = [...new Map(rowEvents.map((e): [string, AppEvent] => [e.id, e])).values()].sort(
    byHlc,
  );
  const known = knowledge(unique);
  const knows = (later: AppEvent, earlier: AppEvent): boolean =>
    known.get(later.id)?.has(earlier.id) ?? false;

  const waiting: string[] = [];
  const applied: AppEvent[] = [];
  for (const e of unique) {
    if (refsMissing(e, ctx)) waiting.push(e.id);
    else applied.push(e);
  }

  const create = applied.find((e) => e.op === 'create');
  if (!create) return { row: null, waiting: unique.map((e) => e.id) };
  // Ereignisse ohne anwendbares `create` warten ebenfalls (siehe oben); sonst ist die Zeile vorhanden.

  // Felder: je Feld alle Schreibzugriffe sammeln.
  const writes = new Map<string, Array<{ e: AppEvent; value: unknown }>>();
  for (const e of applied) {
    if ((e.op !== 'create' && e.op !== 'update') || !e.data) continue;
    for (const [field, value] of Object.entries(e.data)) {
      const list = writes.get(field) ?? [];
      list.push({ e, value });
      writes.set(field, list);
    }
  }

  const fields: Record<string, unknown> = {};
  const conflictFields: RowConflict['fields'] = [];
  for (const [field, list] of writes) {
    const winner = list[list.length - 1] as (typeof list)[number]; // `unique` ist nach HLC sortiert
    fields[field] = winner.value;
    if (!CONFLICT_ENTITIES.has(entity)) continue;
    const heads = list.filter((w) => !list.some((o) => o !== w && knows(o.e, w.e)));
    const distinct: typeof heads = [];
    for (const h of heads) if (!distinct.some((d) => same(d.value, h.value))) distinct.push(h);
    if (distinct.length > 1) {
      conflictFields.push({
        field,
        candidates: heads.map((h) => ({
          eventId: h.e.id,
          value: h.value,
          hlc: h.e.hlc,
          author: h.e.author,
        })),
      });
    }
  }

  // Lebenszyklus: der jüngste Eintrag aus create/delete/restore entscheidet.
  const lifecycle = applied.filter((e) => e.op !== 'update');
  const last = lifecycle[lifecycle.length - 1];
  const deleted = last?.op === 'delete';

  let conflict: RowConflict | null = null;
  if (conflictFields.length > 0) {
    conflict = {
      kind: 'fields',
      fields: conflictFields,
      eventIds: [...new Set(conflictFields.flatMap((f) => f.candidates.map((c) => c.eventId)))],
    };
  } else if (CONFLICT_ENTITIES.has(entity)) {
    // Löschen gegen Bearbeiten: gleichzeitig und von keinem späteren Ereignis zusammengeführt.
    for (const d of applied.filter((e) => e.op === 'delete')) {
      for (const u of applied.filter((e) => e.op === 'update')) {
        if (knows(d, u) || knows(u, d)) continue;
        const resolved = applied.some((r) => knows(r, d) && knows(r, u));
        if (!resolved) {
          conflict = { kind: 'deleteVsEdit', fields: [], eventIds: [d.id, u.id] };
        }
      }
    }
  }

  return {
    row: {
      entity,
      id: create.rowId,
      fields,
      deleted,
      hlc: (applied[applied.length - 1] as AppEvent).hlc,
      createdBy: create.author,
      createdByDevice: create.device,
      conflict,
    },
    waiting: waiting.length > 0 ? waiting : [],
  };
}

/** Kennzeichen, dass eine Zeile nach Eintreffen neuer Ereignisse neu berechnet werden muss. */
export const rowKey = (entity: Entity, rowId: string): string => `${entity}:${rowId}`;

export interface FoldAllResult {
  rows: FoldedRow[];
  waiting: string[];
}

/** Gesamtberechnung im Speicher (Tests, Export-Prüfung). Reihenfolge der Eingabe ist egal. */
export function foldAll(
  events: readonly AppEvent[],
  memberIds: ReadonlySet<string>,
): FoldAllResult {
  const groups = new Map<string, AppEvent[]>();
  for (const e of events) {
    const k = rowKey(e.entity, e.rowId);
    const list = groups.get(k) ?? [];
    list.push(e);
    groups.set(k, list);
  }
  const rows: FoldedRow[] = [];
  const waiting: string[] = [];
  const categories = new Set<string>();
  const ctx: FoldContext = {
    hasCategory: (id) => categories.has(id),
    hasMember: (id) => memberIds.has(id),
  };
  // Kategorien zuerst, damit Referenzen auf sie auflösbar sind.
  const order: Entity[] = ['category', 'member', 'settings', 'entry', 'budget'];
  for (const entity of order) {
    for (const [k, list] of groups) {
      if (!k.startsWith(`${entity}:`)) continue;
      const result = foldRow(entity, list, ctx);
      waiting.push(...result.waiting);
      if (result.row) {
        rows.push(result.row);
        if (entity === 'category') categories.add(result.row.id);
      }
    }
  }
  rows.sort((a, b) => (rowKey(a.entity, a.id) < rowKey(b.entity, b.id) ? -1 : 1));
  return { rows, waiting: waiting.sort() };
}

/** Köpfe einer Zeile: die Ereignisse, die kein anderes Ereignis der Zeile kennt. Dient als `base` neuer Ereignisse. */
export function headsOf(rowEvents: readonly AppEvent[]): string[] {
  const known = knowledge([...rowEvents]);
  const all = new Set<string>();
  for (const k of known.values()) for (const id of k) all.add(id);
  return rowEvents
    .filter((e) => !all.has(e.id))
    .sort(byHlc)
    .map((e) => e.id);
}
