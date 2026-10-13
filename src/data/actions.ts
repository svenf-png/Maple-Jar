import type { CategoryTemplateEntry } from '../domain/category-template';
import {
  autobookCandidates,
  bookingDraft,
  bookingState,
  defaultPayer,
  fixedCostEntryId,
} from '../domain/fixed-cost';
import { chooseRate, type KnownRate } from '../domain/fx';
import { monthOf, type RepeatUnit, toEntry, toFixedCost } from '../domain/model';
import type { Currency } from '../domain/money';
import type { MapleJarDb } from './db';
import { validateCreateData } from './events/schema';
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

// --- M3: Einnahmen, Fixkosten, Sparziele ---------------------------------------------------------

const clean = (patch: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, k === 'name' && typeof v === 'string' ? v.trim() : v]),
  );

export class InvalidPatchError extends Error {
  override name = 'InvalidPatchError';
  constructor() {
    super('Patch makes the row invalid');
  }
}

/**
 * Schreibt nur Felder, die sich vom materialisierten Stand unterscheiden. `null` löscht ein optionales Feld.
 * Der zusammengeführte Stand (aktuell + Patch) wird vorab gegen die `create`-Regeln geprüft; bei Verstoß
 * wirft die Funktion `InvalidPatchError` und schreibt nichts.
 */
async function updateFields(
  db: MapleJarDb,
  entity: 'income' | 'fixedCost' | 'goal',
  id: string,
  patch: object,
): Promise<boolean> {
  const current = await db[entity].get(id);
  if (!current) return false;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean(patch))) {
    if (v === null ? current[k] != null : JSON.stringify(current[k]) !== JSON.stringify(v))
      data[k] = v;
  }
  if (Object.keys(data).length === 0) return false;
  const merged = Object.fromEntries(
    Object.entries({ ...current, ...data }).filter(([, v]) => v !== null && v !== undefined),
  );
  if (!validateCreateData(entity, merged)) throw new InvalidPatchError();
  await appendLocalEvent(db, { entity, rowId: id, op: 'update', data });
  return true;
}

async function createRow(
  db: MapleJarDb,
  entity: 'income' | 'fixedCost' | 'goal' | 'goalContribution',
  input: object,
): Promise<string> {
  const rowId = crypto.randomUUID();
  await appendLocalEvent(db, { entity, rowId, op: 'create', data: clean(input) });
  return rowId;
}

export interface RepeatInput {
  unit: RepeatUnit;
  every: number;
  startsOn: string;
  endsOn?: string;
}

export interface IncomeInput extends RepeatInput {
  name: string;
  memberId?: string;
  amountMinor: number;
  currency: Currency;
}

export const createIncome = (db: MapleJarDb, input: IncomeInput) => createRow(db, 'income', input);
/** Update-Patch: optionale Felder akzeptieren `null` zum Löschen. */
type Clearable<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] | null };
export type IncomePatch = Partial<Clearable<IncomeInput, 'endsOn' | 'memberId'>>;
export type FixedCostPatch = Partial<Clearable<FixedCostInput, 'endsOn' | 'icon'>>;
export type GoalPatch = Partial<GoalInput> & { archivedAt?: string | null };

export const updateIncome = (db: MapleJarDb, id: string, patch: IncomePatch) =>
  updateFields(db, 'income', id, patch);
export const deleteIncome = (db: MapleJarDb, id: string) =>
  appendLocalEvent(db, { entity: 'income', rowId: id, op: 'delete' });

export interface FixedCostInput extends RepeatInput {
  name: string;
  amountMinor: number;
  currency: Currency;
  categoryId: string;
  icon?: string;
  isSaving: boolean;
  autobook: boolean;
}

export const createFixedCost = (db: MapleJarDb, input: FixedCostInput) =>
  createRow(db, 'fixedCost', input);
export const updateFixedCost = (db: MapleJarDb, id: string, patch: FixedCostPatch) =>
  updateFields(db, 'fixedCost', id, patch);
export const deleteFixedCost = (db: MapleJarDb, id: string) =>
  appendLocalEvent(db, { entity: 'fixedCost', rowId: id, op: 'delete' });

export interface GoalInput {
  name: string;
  icon: string;
  color: string;
  targetMinor: number;
  currency: Currency;
  startsOn: string;
  targetDate: string;
}

export const createGoal = (db: MapleJarDb, input: GoalInput) => createRow(db, 'goal', input);
export const updateGoal = (db: MapleJarDb, id: string, patch: GoalPatch) =>
  updateFields(db, 'goal', id, patch);
/** Archiviert ein Ziel (`archivedAt` = `today`, `YYYY-MM-DD`). Bereits archivierte Ziele bleiben unverändert. */
export const archiveGoal = async (db: MapleJarDb, id: string, today: string): Promise<boolean> => {
  const current = await db.goal.get(id);
  if (!current || current.archivedAt) return false;
  return updateFields(db, 'goal', id, { archivedAt: today });
};

export interface ContributionInput {
  goalId: string;
  amountMinor: number;
  contributedOn: string;
  memberId?: string;
  note: string;
}

export const addContribution = (db: MapleJarDb, input: ContributionInput) =>
  createRow(db, 'goalContribution', { ...input, note: input.note.trim() });
export const deleteContribution = (db: MapleJarDb, id: string) =>
  appendLocalEvent(db, { entity: 'goalContribution', rowId: id, op: 'delete' });

export type BookResult = 'booked' | 'already' | 'restored';

const sessionUser = async (db: MapleJarDb): Promise<string> => {
  const id = (await db.meta.get('userId'))?.value;
  if (typeof id !== 'string') throw new Error('No session');
  return id;
};

const householdMembers = async (db: MapleJarDb): Promise<Array<{ userId: string }>> =>
  ((await db.meta.get('household'))?.value as { members?: Array<{ userId: string }> } | undefined)
    ?.members ?? [];

async function createFixedEntry(
  db: MapleJarDb,
  rowId: string,
  fc: ReturnType<typeof toFixedCost>,
  dueOn: string,
  rate: KnownRate | null,
  paidBy: string,
): Promise<void> {
  const draft = bookingDraft(fc, dueOn, rate);
  if (!draft) throw new NoRateError();
  await appendLocalEvent(db, {
    entity: 'entry',
    rowId,
    op: 'create',
    data: { ...draft, paidBy, merchant: fc.name, note: '' },
  });
}

/**
 * Bucht eine Fälligkeit mit deterministischer Eintrags-ID (zwei Geräte erzeugen denselben Eintrag).
 * Ausdrücklich gelöschte Buchung: wiederherstellen. Wirft `NoRateError` bei EUR ohne bekannten Kurs.
 * Das `create` trägt immer den Standard-Zahler des Haushalts (`defaultPayer`, ohne Mitglieder der angemeldete Nutzer),
 * damit gleichzeitige Buchungen identisch sind. Ein abweichender `options.paidBy` wird als eigenes `update` danach
 * geschrieben.
 */
export async function bookFixedCost(
  db: MapleJarDb,
  fixedCostId: string,
  dueOn: string,
  rate: KnownRate | null,
  options: { paidBy?: string } = {},
): Promise<BookResult> {
  const fcRow = await db.fixedCost.get(fixedCostId);
  if (!fcRow) throw new Error('Fixed cost not found');
  const rowId = await fixedCostEntryId(fixedCostId, dueOn);
  const existing = await db.entry.get(rowId);
  const state = bookingState(rowId, existing ? [toEntry(existing)] : []);
  if (state === 'booked') return 'already';
  if (state === 'deleted') {
    await appendLocalEvent(db, { entity: 'entry', rowId, op: 'restore' });
    return 'restored';
  }
  const payer = defaultPayer(await householdMembers(db)) ?? (await sessionUser(db));
  await createFixedEntry(db, rowId, toFixedCost(fcRow), dueOn, rate, payer);
  if (options.paidBy && options.paidBy !== payer) {
    await appendLocalEvent(db, {
      entity: 'entry',
      rowId,
      op: 'update',
      data: { paidBy: options.paidBy },
    });
  }
  return 'booked';
}

/** Kurs für eine Fälligkeit: fester Kurs, keiner, oder eine Abfrage je Fälligkeitstag (z. B. Tageskurs). */
export type RateSource = KnownRate | null | ((dueOn: string) => Promise<KnownRate | null>);

/**
 * Bucht alle fälligen Autobook-Fixkosten der letzten 35 Tage, die noch offen sind. Gelöschte Buchungen werden
 * nie neu gebucht. EUR ohne Kurs wird übersprungen; Fehler einzelner Fälligkeiten brechen den Lauf nicht ab.
 * Ohne Haushaltsmitglieder wird nichts gebucht (kein Zahler ableitbar). Der Kurs wird je Fälligkeitstag
 * (einmal pro Lauf zwischengespeichert) erfragt. Gibt die Anzahl neu gebuchter Einträge zurück.
 */
export async function runAutobook(
  db: MapleJarDb,
  rate: RateSource,
  today: string,
): Promise<number> {
  const paidBy = defaultPayer(await householdMembers(db));
  if (!paidBy) return 0;
  const fixedCosts = (await db.fixedCost.toArray()).map(toFixedCost);
  const entries = (await db.entry.filter((e) => e.source === 'fixed').toArray()).map(toEntry);
  const fcById = new Map(fixedCosts.map((f) => [f.id, f]));
  const cache = new Map<string, KnownRate | null>();
  const rateFor = async (dueOn: string): Promise<KnownRate | null> => {
    if (typeof rate !== 'function') return rate;
    if (!cache.has(dueOn)) cache.set(dueOn, await rate(dueOn).catch(() => null));
    return cache.get(dueOn) ?? null;
  };
  let booked = 0;
  for (const item of await autobookCandidates(fixedCosts, entries, today)) {
    const fc = fcById.get(item.fixedCostId);
    if (!fc) continue;
    try {
      const r = fc.currency === 'EUR' ? await rateFor(item.dueOn) : null;
      await createFixedEntry(db, item.entryId, fc, item.dueOn, r, paidBy);
      booked++;
    } catch {
      // EUR ohne Kurs, ungültiges Ereignis o. Ä.: später erneut versuchen.
    }
  }
  return booked;
}
