import { InvalidPatchError } from './actions';
import type { MapleJarDb } from './db';
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
 * Behält eine Version: schreibt ALLE strittigen Felder mit den gewählten Werten als ein `update`.
 * `base` enthält durch `headsOf` beide Köpfe, das beendet den Konflikt auf allen Geräten.
 */
export async function keepVersion(
  db: MapleJarDb,
  entity: ConflictEntity,
  rowId: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  const current = await db[entity].get(rowId);
  if (!current || Object.keys(values).length === 0) return false;
  assertValid(entity, current, values);
  await appendLocalEvent(db, { entity, rowId, op: 'update', data: values });
  return true;
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

/**
 * Beide Versionen behalten (nur Einträge): `keep` bleibt in der Zeile, jede Version aus `others`
 * wird als neuer manueller Eintrag angelegt. Gibt die neuen Zeilen-IDs zurück.
 */
export async function keepBoth(
  db: MapleJarDb,
  entryId: string,
  keep: Record<string, unknown>,
  others: Array<Record<string, unknown>>,
): Promise<string[]> {
  const current = await db.entry.get(entryId);
  if (!current) return [];
  const creates = others.map((o) => entryCreateData(current, o));
  if (!creates.every((d) => validateCreateData('entry', d))) throw new InvalidPatchError();
  await keepVersion(db, 'entry', entryId, keep);
  const ids: string[] = [];
  for (const data of creates) {
    const rowId = crypto.randomUUID();
    await appendLocalEvent(db, { entity: 'entry', rowId, op: 'create', data });
    ids.push(rowId);
  }
  return ids;
}

/** Löschen gegen Bearbeiten: wiederherstellen (`restore` mit beiden Köpfen als base). */
export const restoreRow = (db: MapleJarDb, entity: Entity, rowId: string) =>
  appendLocalEvent(db, { entity, rowId, op: 'restore' });

/** Löschen gegen Bearbeiten: gelöscht lassen (weiteres `delete` mit beiden Köpfen als base). */
export const confirmDelete = (db: MapleJarDb, entity: Entity, rowId: string) =>
  appendLocalEvent(db, { entity, rowId, op: 'delete' });
