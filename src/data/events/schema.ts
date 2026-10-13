import * as z from 'zod/mini';
import { HLC_PATTERN } from './hlc';

export const SCHEMA_VERSION = 1;

/** Materialisierte Entitäten. `scenario` (M4) kommt später. */
export const ENTITIES = [
  'settings',
  'member',
  'category',
  'entry',
  'budget',
  'income',
  'fixedCost',
  'goal',
  'goalContribution',
] as const;
export type Entity = (typeof ENTITIES)[number];
export const OPS = ['create', 'update', 'delete', 'restore'] as const;
export type Op = (typeof OPS)[number];

const isoDate = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const monthStart = z.string().check(z.regex(/^\d{4}-\d{2}-01$/));
const currency = z.enum(['CAD', 'EUR']);
const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const minor = z.int().check(z.gte(0), z.lte(1_000_000_000_000));
const positiveMinor = z.int().check(z.gt(0), z.lte(1_000_000_000_000));
const nonZeroMinor = z.int().check(
  z.gte(-1_000_000_000_000),
  z.lte(1_000_000_000_000),
  z.refine((n) => n !== 0),
);
const hexColor = z.string().check(z.regex(/^#[0-9A-Fa-f]{6}$/));
const repeat = {
  unit: z.enum(['once', 'week', 'month', 'year']),
  every: z.int().check(z.gte(1), z.lte(52)),
  startsOn: isoDate,
  endsOn: z.optional(isoDate),
} as const;

const fieldSchemas = {
  settings: {
    name: text(80),
    placeLabel: z.nullable(text(80)),
    periodStart: monthStart,
    periodEnd: isoDate,
    baseCurrency: z.literal('CAD'),
    secondCurrency: z.literal('EUR'),
    fxProvider: z.enum(['ECB', 'BOC']),
  },
  member: {
    displayName: text(60),
    color: z.string().check(z.regex(/^#[0-9A-Fa-f]{6}$/)),
    locale: z.enum(['de-DE', 'en-CA']),
    theme: z.enum(['auto', 'light', 'dark']),
  },
  category: {
    name: text(60),
    icon: text(40),
    color: z.string().check(z.regex(/^#[0-9A-Fa-f]{6}$/)),
    sort: z.int().check(z.gte(0), z.lte(10_000)),
    hidden: z.boolean(),
  },
  entry: {
    amountMinor: positiveMinor,
    currency,
    /** Kurs × 10⁶ (CAD = 1 000 000). Ganzzahl, Berechnung mit BigInt. */
    fxRateMicro: z.int().check(z.gt(0), z.lte(1_000_000_000_000)),
    fxRateDate: isoDate,
    fxProvisional: z.boolean(),
    bookedOn: isoDate,
    categoryId: z.uuid(),
    paidBy: z.uuid(),
    merchant: z.string().check(z.maxLength(120)),
    note: z.string().check(z.maxLength(500)),
    source: z.enum(['manual', 'fixed']),
    fixedCostId: z.optional(z.uuid()),
  },
  budget: {
    categoryId: z.uuid(),
    validFrom: monthStart,
    monthlyLimitCadMinor: minor,
  },
  income: {
    name: text(80),
    memberId: z.optional(z.uuid()),
    amountMinor: positiveMinor,
    currency,
    ...repeat,
  },
  fixedCost: {
    name: text(80),
    amountMinor: positiveMinor,
    currency,
    ...repeat,
    categoryId: z.uuid(),
    icon: z.optional(text(40)),
    isSaving: z.boolean(),
    autobook: z.boolean(),
  },
  goal: {
    name: text(80),
    icon: text(40),
    color: hexColor,
    targetMinor: positiveMinor,
    currency,
    startsOn: isoDate,
    targetDate: isoDate,
    archivedAt: z.optional(isoDate),
  },
  goalContribution: {
    goalId: z.uuid(),
    amountMinor: nonZeroMinor,
    contributedOn: isoDate,
    memberId: z.optional(z.uuid()),
    note: z.string().check(z.maxLength(500)),
  },
} as const;

type RepeatFields = { unit: string; every: number; startsOn: string; endsOn?: string | undefined };
const repeatValid = (d: RepeatFields): boolean =>
  (d.endsOn === undefined || d.endsOn >= d.startsOn) &&
  (d.unit !== 'once' || (d.every === 1 && d.endsOn === undefined));

// `create` verlangt alle Pflichtfelder, `update` nur geänderte Felder (mindestens eines).
const createSchemas = {
  settings: z.strictObject(fieldSchemas.settings),
  member: z.strictObject(fieldSchemas.member),
  category: z.strictObject(fieldSchemas.category),
  entry: z.strictObject(fieldSchemas.entry).check(
    z.refine((d) => d.currency !== 'CAD' || d.fxRateMicro === 1_000_000, {
      path: ['fxRateMicro'],
    }),
  ),
  budget: z.strictObject(fieldSchemas.budget),
  income: z.strictObject(fieldSchemas.income).check(z.refine(repeatValid)),
  fixedCost: z.strictObject(fieldSchemas.fixedCost).check(z.refine(repeatValid)),
  goal: z.strictObject(fieldSchemas.goal).check(z.refine((d) => d.targetDate > d.startsOn)),
  goalContribution: z.strictObject(fieldSchemas.goalContribution),
} as const;

// Optionale Felder (endsOn, memberId, icon, archivedAt) lassen sich per `update` setzen und mit `null` löschen
// (nur in `update`; `create` lässt sie weg).
const clearable = <T extends z.core.SomeType>(t: T) => z.optional(z.nullable(t));
const incomeUpdate = {
  ...fieldSchemas.income,
  memberId: clearable(fieldSchemas.income.memberId),
  endsOn: clearable(fieldSchemas.income.endsOn),
};
const fixedCostUpdate = {
  ...fieldSchemas.fixedCost,
  endsOn: clearable(fieldSchemas.fixedCost.endsOn),
  icon: clearable(fieldSchemas.fixedCost.icon),
};
const goalUpdate = {
  ...fieldSchemas.goal,
  archivedAt: clearable(fieldSchemas.goal.archivedAt),
};
const atLeastOne = z.refine((d) => Object.keys(d as object).length > 0);
const updateSchemas = {
  settings: z.partial(z.strictObject(fieldSchemas.settings)).check(atLeastOne),
  member: z.partial(z.strictObject(fieldSchemas.member)).check(atLeastOne),
  category: z.partial(z.strictObject(fieldSchemas.category)).check(atLeastOne),
  entry: z.partial(z.strictObject(fieldSchemas.entry)).check(atLeastOne),
  budget: z.partial(z.strictObject(fieldSchemas.budget)).check(atLeastOne),
  income: z.partial(z.strictObject(incomeUpdate)).check(atLeastOne),
  fixedCost: z.partial(z.strictObject(fixedCostUpdate)).check(atLeastOne),
  goal: z.partial(z.strictObject(goalUpdate)).check(atLeastOne),
} as const;

/**
 * Prüft vollständige Zeilendaten (Felder von `create`) gegen Schema und Verfeinerungen (z. B. Ende nicht vor Start).
 * Dient dazu, einen Änderungswunsch vor dem Schreiben gegen den zusammengeführten Stand zu prüfen.
 */
export function validateCreateData(
  entity: Exclude<Entity, 'goalContribution'>,
  data: Record<string, unknown>,
): boolean {
  const known = new Set(Object.keys(fieldSchemas[entity]));
  const picked = Object.fromEntries(Object.entries(data).filter(([k]) => known.has(k)));
  return createSchemas[entity].safeParse(picked).success;
}

const envelope = z.strictObject({
  v: z.literal(SCHEMA_VERSION),
  id: z.uuid(),
  hlc: z.string().check(z.regex(HLC_PATTERN)),
  device: z.uuid(),
  author: z.uuid(),
  entity: z.enum(ENTITIES),
  rowId: z.uuid(),
  op: z.enum(OPS),
  base: z.array(z.uuid()).check(z.maxLength(50)),
  data: z.optional(z.record(z.string(), z.unknown())),
});

export interface AppEvent {
  v: 1;
  id: string;
  hlc: string;
  device: string;
  author: string;
  entity: Entity;
  rowId: string;
  op: Op;
  base: string[];
  data?: Record<string, unknown>;
}

export type ParseResult = { ok: true; event: AppEvent } | { ok: false; reason: string };

const pathOf = (issue: { path: readonly PropertyKey[] }): string =>
  issue.path.map((p) => String(p)).join('.');

/**
 * Prüft ein gelesenes Ereignis. Der Grund enthält nur Pfad und Art des Fehlers, nie Werte.
 * `null` in `data` (Spalte leer) zählt als nicht vorhanden.
 */
export function parseEvent(raw: unknown): ParseResult {
  const input =
    typeof raw === 'object' &&
    raw !== null &&
    'data' in raw &&
    (raw as { data: unknown }).data === null
      ? { ...(raw as object), data: undefined }
      : raw;
  const env = envelope.safeParse(input);
  if (!env.success) {
    const issue = env.error.issues[0];
    return {
      ok: false,
      reason: `envelope: ${issue ? `${pathOf(issue)} ${issue.code}` : 'invalid'}`,
    };
  }
  const e = env.data;
  if (e.entity === 'goalContribution' && (e.op === 'update' || e.op === 'restore')) {
    return { ok: false, reason: `${e.entity}.${e.op}: op not allowed` };
  }
  if (e.op === 'delete' || e.op === 'restore') {
    if (e.data !== undefined) return { ok: false, reason: `${e.entity}.${e.op}: data not allowed` };
  } else {
    const schema =
      e.op === 'create'
        ? createSchemas[e.entity]
        : updateSchemas[e.entity as Exclude<Entity, 'goalContribution'>];
    const data = schema.safeParse(e.data ?? {});
    if (!data.success) {
      const issue = data.error.issues[0];
      return {
        ok: false,
        reason: `${e.entity}.${e.op}: ${issue ? `${pathOf(issue)} ${issue.code}` : 'invalid'}`,
      };
    }
  }
  return { ok: true, event: e as AppEvent };
}
