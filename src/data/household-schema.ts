import * as z from 'zod/mini';

const isoDate = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const monthStart = z.string().check(z.regex(/^\d{4}-\d{2}-01$/));

export const settingsSchema = z.strictObject({
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  placeLabel: z.nullable(z.string().check(z.minLength(1), z.maxLength(80))),
  periodStart: monthStart,
  periodEnd: isoDate,
  baseCurrency: z.literal('CAD'),
  secondCurrency: z.literal('EUR'),
  fxProvider: z.enum(['ECB', 'BOC']),
});

export const memberSchema = z.strictObject({
  userId: z.uuid(),
  username: z.string().check(z.regex(/^[a-z0-9._-]{1,40}$/)),
  displayName: z.string().check(z.minLength(1), z.maxLength(60)),
  color: z.string().check(z.regex(/^#[0-9A-Fa-f]{6}$/)),
  locale: z.enum(['de-DE', 'en-CA']),
  theme: z.enum(['auto', 'light', 'dark']),
});

export const householdSchema = z.strictObject({
  formatVersion: z.literal(1),
  householdId: z.uuid(),
  createdAt: z.string(),
  settings: settingsSchema,
  members: z.array(memberSchema).check(z.maxLength(2)),
});

// Zur Typprüfung: das Schema muss zu `Household` passen.
export type ParsedHousehold = z.infer<typeof householdSchema>;
