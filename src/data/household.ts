import * as z from 'zod/mini';

export const MEMBER_COLORS = [
  '#2C6CB0',
  '#A2456E',
  '#13857A',
  '#5B55B8',
  '#B4602F',
  '#2F7D4F',
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

const isoDate = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const monthStart = z.string().check(z.regex(/^\d{4}-\d{2}-01$/));

const member = z.object({
  githubLogin: z.string().check(z.minLength(1), z.maxLength(39)),
  displayName: z.string().check(z.minLength(1), z.maxLength(60)),
  color: z.enum(MEMBER_COLORS),
});

export const householdSchema = z
  .object({
    format: z.literal(1),
    householdId: z.uuid(),
    createdAt: z.iso.datetime(),
    members: z.array(member).check(z.minLength(1), z.maxLength(2)),
    settings: z.object({
      name: z.string().check(z.minLength(1), z.maxLength(80)),
      placeLabel: z.nullable(z.string().check(z.minLength(1), z.maxLength(80))),
      periodStart: monthStart,
      periodEnd: isoDate,
      baseCurrency: z.literal('CAD'),
      secondCurrency: z.literal('EUR'),
      fxProvider: z.enum(['ECB', 'BOC']),
    }),
  })
  .check(
    z.refine((h) => h.settings.periodEnd > h.settings.periodStart, {
      message: 'periodEnd must be after periodStart',
      path: ['settings', 'periodEnd'],
    }),
    z.refine(
      (h) => {
        const logins = h.members.map((m) => m.githubLogin.toLowerCase());
        return new Set(logins).size === logins.length;
      },
      { message: 'duplicate githubLogin', path: ['members'] },
    ),
  );

export type Household = z.infer<typeof householdSchema>;
export type HouseholdMember = Household['members'][number];

export function parseHousehold(text: string): Household | null {
  try {
    const result = householdSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function findMember(household: Household, login: string): HouseholdMember | undefined {
  return household.members.find((m) => sameLogin(m.githubLogin, login));
}

/** Letzter Tag des letzten Monats bei `months` Monaten ab `startMonth` (`YYYY-MM-01`). */
export function periodEndFor(startMonth: string, months: number): string {
  const y = Number(startMonth.slice(0, 4));
  const m = Number(startMonth.slice(5, 7));
  // Tag 0 des Folgemonats = letzter Tag des letzten Monats
  const end = new Date(Date.UTC(y, m - 1 + months, 0));
  return end.toISOString().slice(0, 10);
}

export function serializeHousehold(h: Household): string {
  return `${JSON.stringify(h, null, 2)}\n`;
}
