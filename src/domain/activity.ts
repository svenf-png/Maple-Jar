import { parseHlc } from '../data/events/hlc';

// Aktivitäts-Feed und Änderungshistorie, direkt aus den Ereignissen (nur Einträge).

export interface ActivityEvent {
  id: string;
  hlc: string;
  author: string;
  entity: string;
  rowId: string;
  op: string;
  data?: Record<string, unknown> | undefined;
}

export type ActivityKind = 'added' | 'amountChanged' | 'edited' | 'deleted' | 'restored';

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ActivityItem {
  id: string;
  hlc: string;
  /** Zeitpunkt aus der HLC (ms), nur zur Gruppierung nach Tagen. */
  at: number;
  author: string;
  kind: ActivityKind;
  entryId: string;
  merchant: string;
  amountMinor: number;
  currency: string;
  changes: FieldChange[];
}

/** Felder, die vom System (Kurs nachziehen) kommen und nicht als Aktivität zählen. */
const SYSTEM_FIELDS = new Set(['fxRateMicro', 'fxRateDate', 'fxProvisional']);

/** Aktivität aus Ereignissen, neueste zuerst. Reihenfolge der Eingabe ist egal. */
export function buildActivity(events: readonly ActivityEvent[]): ActivityItem[] {
  const sorted = events
    .filter((e) => e.entity === 'entry')
    .sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : 1));
  const state = new Map<string, Record<string, unknown>>();
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const e of sorted) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const cur = state.get(e.rowId) ?? {};
    const at = parseHlc(e.hlc)?.ms ?? 0;
    const base = {
      id: e.id,
      hlc: e.hlc,
      at,
      author: e.author,
      entryId: e.rowId,
    };
    const snapshot = (): { merchant: string; amountMinor: number; currency: string } => ({
      merchant: String(cur.merchant ?? ''),
      amountMinor: Number(cur.amountMinor ?? 0),
      currency: String(cur.currency ?? 'CAD'),
    });
    if (e.op === 'create' && e.data) {
      state.set(e.rowId, { ...e.data });
      out.push({ ...base, kind: 'added', ...pick(e.data), changes: [] });
    } else if (e.op === 'update' && e.data) {
      const changes: FieldChange[] = [];
      for (const [field, to] of Object.entries(e.data)) {
        if (JSON.stringify(cur[field]) !== JSON.stringify(to))
          changes.push({ field, from: cur[field], to });
      }
      state.set(e.rowId, { ...cur, ...e.data });
      const visible = changes.filter((c) => !SYSTEM_FIELDS.has(c.field));
      if (visible.length === 0) continue;
      const kind: ActivityKind = visible.some((c) => c.field === 'amountMinor')
        ? 'amountChanged'
        : 'edited';
      out.push({ ...base, kind, ...pick(state.get(e.rowId) ?? {}), changes: visible });
    } else if (e.op === 'delete' || e.op === 'restore') {
      out.push({
        ...base,
        kind: e.op === 'delete' ? 'deleted' : 'restored',
        ...snapshot(),
        changes: [],
      });
    }
  }
  return out.reverse();
}

const pick = (d: Record<string, unknown>) => ({
  merchant: String(d.merchant ?? ''),
  amountMinor: Number(d.amountMinor ?? 0),
  currency: String(d.currency ?? 'CAD'),
});

/** Änderungshistorie eines Eintrags (neueste zuerst). */
export const entryHistory = (events: readonly ActivityEvent[], entryId: string): ActivityItem[] =>
  buildActivity(events.filter((e) => e.rowId === entryId));

/** Neu = von der anderen Person und nach dem letzten Besuch des Feeds. */
export const isNewActivity = (
  item: ActivityItem,
  me: string,
  lastSeenHlc: string | null,
): boolean => item.author !== me && (lastSeenHlc === null || item.hlc > lastSeenHlc);
