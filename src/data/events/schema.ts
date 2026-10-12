import * as z from 'zod/mini';
import { HLC_PATTERN } from './hlc';

export const SCHEMA_VERSION = 1;

/** In M2 materialisierte Entitäten. Weitere (income, fixedCost, goal …) kommen in M3/M4. */
export const ENTITIES = ['settings', 'member', 'category', 'entry', 'budget'] as const;
export type Entity = (typeof ENTITIES)[number];
export const OPS = ['create', 'update', 'delete', 'restore'] as const;
export type Op = (typeof OPS)[number];

const isoDate = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const monthStart = z.string().check(z.regex(/^\d{4}-\d{2}-01$/));
const currency = z.enum(['CAD', 'EUR']);
const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const minor = z.int().check(z.gte(0), z.lte(1_000_000_000_000));
const positiveMinor = z.int().check(z.gt(0), z.lte(1_000_000_000_000));

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
} as const;

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
} as const;

const atLeastOne = z.refine((d) => Object.keys(d as object).length > 0);
const updateSchemas = {
  settings: z.partial(z.strictObject(fieldSchemas.settings)).check(atLeastOne),
  member: z.partial(z.strictObject(fieldSchemas.member)).check(atLeastOne),
  category: z.partial(z.strictObject(fieldSchemas.category)).check(atLeastOne),
  entry: z.partial(z.strictObject(fieldSchemas.entry)).check(atLeastOne),
  budget: z.partial(z.strictObject(fieldSchemas.budget)).check(atLeastOne),
} as const;

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
  if (e.op === 'delete' || e.op === 'restore') {
    if (e.data !== undefined) return { ok: false, reason: `${e.entity}.${e.op}: data not allowed` };
  } else {
    const schema = e.op === 'create' ? createSchemas[e.entity] : updateSchemas[e.entity];
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
