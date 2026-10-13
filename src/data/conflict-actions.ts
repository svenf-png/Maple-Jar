import { InvalidPatchError } from './actions';
import type { MapleJarDb } from './db';
import { toAppEvent } from './events/apply';
import { headsOf } from './events/fold';
import { parseHlc } from './events/hlc';
import { type Entity, validateCreateData } from './events/schema';
import { appendLocalEvent } from './write';

/** Entitäten mit Konflikt-Dialog (Einstellungen, Kategorien, Budgets bleiben Last-Write-Wins). */
export type ConflictEntity = 'entry' | 'income' | 'fixedCost' | 'goal';

const present = (row: object) =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined));

/** Wie `updateFields`: nur ablehnen, wenn die Wahl eine gültige Zeile ungültig macht. */
function assertValid(entity: ConflictEntity, current: object, values: Record<string, unknown>) {
  if (
    validateCreateData(entity, present(current)) &&
    !validateCreateData(entity, present({ ...current, ...values }))
  ) {
    throw new InvalidPatchError();
  }
}

/**
 * Geldfelder, die nur zusammen Sinn ergeben (Betrag, Währung, Kurs): bei einem Konflikt in einem Mitglied trägt jede
 * Version den vollständigen Satz, Behalten schreibt den ganzen Satz.
 */
export const MONEY_GROUPS: Record<ConflictEntity, readonly string[]> = {
  entry: ['amountMinor', 'currency', 'fxRateMicro', 'fxRateDate', 'fxProvisional'],
  income: ['amountMinor', 'currency'],
  fixedCost: ['amountMinor', 'currency'],
  goal: ['targetMinor', 'currency'],
};

/** Wanduhrzeit für eine Auflösung: nach allen Köpfen der Zeile, auch bei vorgehender Uhr eines Geräts. */
async function resolutionNow(db: MapleJarDb, entity: Entity, rowId: string): Promise<number> {
  const events = (await db.events.where('[entity+rowId]').equals([entity, rowId]).toArray()).map(
    toAppEvent,
  );
  const heads = new Set(headsOf(events));
  const maxHead = events
    .filter((e) => heads.has(e.id))
    .reduce((m, e) => Math.max(m, parseHlc(e.hlc)?.ms ?? 0), 0);
  return Math.max(Date.now(), maxHead + 1);
}

const defined = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));

/**
 * Behält eine Version: schreibt ALLE strittigen Felder mit den gewählten Werten als ein `update`.
 * `base` enthält durch `headsOf` beide Köpfe, das beendet den Konflikt auf allen Geräten.
 * Ist die Zeile gelöscht (gleichzeitiges Löschen), wird sie im selben Schritt mit `restore` wiederhergestellt.
 */
export async function keepVersion(
  db: MapleJarDb,
  entity: ConflictEntity,
  rowId: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  const data = defined(values);
  if (Object.keys(data).length === 0) return false;
  return db.transaction('rw', db.tables, async () => {
    const current = await db[entity].get(rowId);
    if (!current) return false;
    assertValid(entity, current, data);
    const nowMs = await resolutionNow(db, entity, rowId);
    if (current.deleted) await appendLocalEvent(db, { entity, rowId, op: 'restore' }, nowMs);
    await appendLocalEvent(db, { entity, rowId, op: 'update', data }, nowMs);
    return true;
  });
}

const ENTRY_FIELDS = [
  'amountMinor',
  'currency',
  'fxRateMicro',
  'fxRateDate',
  'fxProvisional',
  'bookedOn',
  'categoryId',
  'paidBy',
  'merchant',
  'note',
] as const;

/** Vollständige `create`-Daten eines Eintrags aus Zeile + abweichenden Werten (manuell, Kurs stimmig). */
export function entryCreateData(
  row: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...Object.fromEntries(ENTRY_FIELDS.map((k) => [k, row[k]])),
    ...values,
    source: 'manual',
  };
  if (merged.currency === 'CAD') merged.fxRateMicro = 1_000_000;
  return merged;
}

/** Deterministische ID einer Kopie (UUIDv8 aus SHA-256 über `${rowId}:${copiedVersionEventId}`): gleiche Wahl auf zwei Geräten ergibt dieselbe Zeile. */
export async function keepBothCopyId(rowId: string, copiedVersionEventId: string): Promise<string> {
  const data = new TextEncoder().encode(`${rowId}:${copiedVersionEventId}`);
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', data)).slice(0, 16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x80;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface KeptVersion {
  eventId: string;
  values: Record<string, unknown>;
}

/**
 * Beide Versionen behalten (nur Einträge). Damit zwei Geräte, die beide „beide behalten“ wählen, zu demselben Ergebnis
 * kommen, ist die Aufteilung unabhängig von der Auswahl: die Version mit der kleinsten Ereignis-ID bleibt in der Zeile,
 * jede andere wird als manueller Eintrag mit deterministischer ID angelegt. Alles in einer Transaktion.
 * Gibt die Zeilen-IDs der Kopien zurück.
 */
export async function keepBoth(
  db: MapleJarDb,
  entryId: string,
  versions: readonly KeptVersion[],
  /** Felder, die die in der Zeile bleibende Version schreibt (Standard: alle Werte). */
  keepOnly?: readonly string[],
): Promise<string[]> {
  const [keep, ...copies] = [...versions].sort((a, b) => (a.eventId < b.eventId ? -1 : 1));
  if (!keep) return [];
  const ids = await Promise.all(copies.map((c) => keepBothCopyId(entryId, c.eventId)));
  return db.transaction('rw', db.tables, async () => {
    const current = await db.entry.get(entryId);
    if (!current) return [];
    const creates = copies.map((c) => entryCreateData(current, defined(c.values)));
    if (!creates.every((d) => validateCreateData('entry', d))) throw new InvalidPatchError();
    await keepVersion(
      db,
      'entry',
      entryId,
      keepOnly
        ? Object.fromEntries(Object.entries(keep.values).filter(([k]) => keepOnly.includes(k)))
        : keep.values,
    );
    const nowMs = await resolutionNow(db, 'entry', entryId);
    for (const [i, data] of creates.entries()) {
      await appendLocalEvent(
        db,
        { entity: 'entry', rowId: ids[i] as string, op: 'create', data },
        nowMs,
      );
    }
    return ids;
  });
}

/** Löschen gegen Bearbeiten: wiederherstellen (`restore` mit beiden Köpfen als base). */
export async function restoreRow(db: MapleJarDb, entity: Entity, rowId: string) {
  return appendLocalEvent(
    db,
    { entity, rowId, op: 'restore' },
    await resolutionNow(db, entity, rowId),
  );
}

/**
 * Gelöscht lassen (Löschen gegen Bearbeiten, auch bei zusätzlichem Feldkonflikt): weiteres `delete` mit allen Köpfen
 * als base. Bei einem Feldkonflikt braucht es zusätzlich einen Wert je strittigem Feld (`values`), sonst bliebe er offen.
 */
export async function confirmDelete(
  db: MapleJarDb,
  entity: Entity,
  rowId: string,
  values: Record<string, unknown> = {},
) {
  const data = defined(values);
  return db.transaction('rw', db.tables, async () => {
    const nowMs = await resolutionNow(db, entity, rowId);
    if (Object.keys(data).length > 0)
      await appendLocalEvent(db, { entity, rowId, op: 'update', data }, nowMs);
    return appendLocalEvent(db, { entity, rowId, op: 'delete' }, nowMs);
  });
}
