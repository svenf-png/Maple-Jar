import type { CategoryTemplateEntry } from '../domain/category-template';
import { chooseRate, type KnownRate } from '../domain/fx';
import { monthOf } from '../domain/model';
import type { Currency } from '../domain/money';
import type { MapleJarDb } from './db';
import { appendLocalEvent } from './write';

export interface NewEntryInput {
  amountMinor: number;
  currency: Currency;
  bookedOn: string;
  categoryId: string;
  paidBy: string;
  merchant: string;
  note: string;
  /** Bekannter Kurs für EUR (Tageskurs oder letzter bekannter); bei CAD ignoriert. */
  rate: KnownRate | null;
}

export class NoRateError extends Error {
  override name = 'NoRateError';
  constructor() {
    super('No exchange rate available');
  }
}

/** Legt einen Eintrag an (ein Ereignis). Wirft `NoRateError`, wenn für EUR gar kein Kurs bekannt ist. */
export async function createEntry(db: MapleJarDb, input: NewEntryInput): Promise<string> {
  const choice = chooseRate(input.currency, input.bookedOn, input.rate);
  if (!choice) throw new NoRateError();
  const rowId = crypto.randomUUID();
  await appendLocalEvent(db, {
    entity: 'entry',
    rowId,
    op: 'create',
    data: {
      amountMinor: input.amountMinor,
      currency: input.currency,
      fxRateMicro: choice.rateMicro,
      fxRateDate: choice.rateDate,
      fxProvisional: choice.provisional,
      bookedOn: input.bookedOn,
      categoryId: input.categoryId,
      paidBy: input.paidBy,
      merchant: input.merchant.trim(),
      note: input.note.trim(),
      source: 'manual',
    },
  });
  return rowId;
}

export type EntryPatch = Partial<Omit<NewEntryInput, 'rate'>> & { rate?: KnownRate | null };

/**
 * Ändert nur die tatsächlich geänderten Felder (kleine `update`-Ereignisse, damit gleichzeitige
 * Änderungen verschiedener Felder gemergt werden). Gibt false zurück, wenn nichts zu tun ist.
 */
export async function updateEntry(db: MapleJarDb, id: string, patch: EntryPatch): Promise<boolean> {
  const current = await db.entry.get(id);
  if (!current) return false;
  const data: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (JSON.stringify(current[k]) !== JSON.stringify(v)) data[k] = v;
  };
  if (patch.amountMinor !== undefined) set('amountMinor', patch.amountMinor);
  if (patch.bookedOn !== undefined) set('bookedOn', patch.bookedOn);
  if (patch.categoryId !== undefined) set('categoryId', patch.categoryId);
  if (patch.paidBy !== undefined) set('paidBy', patch.paidBy);
  if (patch.merchant !== undefined) set('merchant', patch.merchant.trim());
  if (patch.note !== undefined) set('note', patch.note.trim());
  const currency = patch.currency ?? (current.currency as Currency);
  const dateChanged = patch.bookedOn !== undefined && patch.bookedOn !== current.bookedOn;
  if (patch.currency !== undefined || dateChanged) {
    const choice = chooseRate(
      currency,
      patch.bookedOn ?? (current.bookedOn as string),
      patch.rate ?? null,
    );
    // Ohne neuen Kurs bleibt der bisherige stehen (Währung unverändert), sonst wäre der Betrag falsch.
    if (choice) {
      set('currency', currency);
      set('fxRateMicro', choice.rateMicro);
      set('fxRateDate', choice.rateDate);
      set('fxProvisional', choice.provisional);
    } else if (patch.currency !== undefined && patch.currency !== current.currency) {
      throw new NoRateError();
    }
  }
  if (Object.keys(data).length === 0) return false;
  await appendLocalEvent(db, { entity: 'entry', rowId: id, op: 'update', data });
  return true;
}

export const deleteEntry = (db: MapleJarDb, id: string) =>
  appendLocalEvent(db, { entity: 'entry', rowId: id, op: 'delete' });

export const restoreEntry = (db: MapleJarDb, id: string) =>
  appendLocalEvent(db, { entity: 'entry', rowId: id, op: 'restore' });

export interface CategoryInput {
  name: string;
  icon: string;
  color: string;
  sort: number;
  hidden: boolean;
}

export async function createCategory(db: MapleJarDb, input: CategoryInput): Promise<string> {
  const rowId = crypto.randomUUID();
  await appendLocalEvent(db, {
    entity: 'category',
    rowId,
    op: 'create',
    data: { ...input, name: input.name.trim() },
  });
  return rowId;
}

export async function updateCategory(
  db: MapleJarDb,
  id: string,
  patch: Partial<CategoryInput>,
): Promise<boolean> {
  const current = await db.category.get(id);
  if (!current) return false;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const value = k === 'name' ? String(v).trim() : v;
    if (current[k] !== value) data[k] = value;
  }
  if (Object.keys(data).length === 0) return false;
  await appendLocalEvent(db, { entity: 'category', rowId: id, op: 'update', data });
  return true;
}

/** Kategorien aus der Vorlage anlegen (Namen in der gewählten Sprache; es sind danach Nutzerdaten). */
export async function applyCategoryTemplate(
  db: MapleJarDb,
  entries: readonly CategoryTemplateEntry[],
  lang: 'de' | 'en',
): Promise<void> {
  let sort = (await db.category.count()) * 10;
  for (const e of entries) {
    await createCategory(db, { name: e[lang], icon: e.icon, color: e.color, sort, hidden: false });
    sort += 10;
  }
}

/**
 * Setzt das Monatslimit einer Kategorie ab einem Monat. Ein vorhandener Eintrag mit demselben `validFrom`
 * wird aktualisiert, sonst ein neuer angelegt (frühere Monate behalten ihr Limit).
 */
export async function setBudget(
  db: MapleJarDb,
  categoryId: string,
  month: string,
  limitMinor: number,
): Promise<void> {
  const validFrom = monthOf(month);
  const existing = await db.budget
    .where('categoryId')
    .equals(categoryId)
    .filter((b) => !b.deleted && b.validFrom === validFrom)
    .first();
  if (existing) {
    if (existing.monthlyLimitCadMinor === limitMinor) return;
    await appendLocalEvent(db, {
      entity: 'budget',
      rowId: existing.id,
      op: 'update',
      data: { monthlyLimitCadMinor: limitMinor },
    });
    return;
  }
  await appendLocalEvent(db, {
    entity: 'budget',
    rowId: crypto.randomUUID(),
    op: 'create',
    data: { categoryId, validFrom, monthlyLimitCadMinor: limitMinor },
  });
}
