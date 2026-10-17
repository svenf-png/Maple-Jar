export const MEMBER_COLORS = [
  '#2C6CB0',
  '#A2456E',
  '#13857A',
  '#5B55B8',
  '#B4602F',
  '#2F7D4F',
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

export interface HouseholdSettings {
  name: string;
  placeLabel: string | null;
  periodStart: string;
  periodEnd: string;
  baseCurrency: 'CAD';
  secondCurrency: 'EUR';
  fxProvider: 'ECB' | 'BOC';
}

export interface HouseholdMember {
  userId: string;
  username: string;
  displayName: string;
  color: string;
  locale: 'de-DE' | 'en-CA';
  theme: 'auto' | 'light' | 'dark';
}

export interface Household {
  formatVersion: 1;
  householdId: string;
  createdAt: string;
  settings: HouseholdSettings;
  members: HouseholdMember[];
}

export const findMember = (household: Household, userId: string): HouseholdMember | undefined =>
  household.members.find((m) => m.userId === userId);

/** Letzter Tag des letzten Monats bei `months` Monaten ab `startMonth` (`YYYY-MM-01`). */
export function periodEndFor(startMonth: string, months: number): string {
  const y = Number(startMonth.slice(0, 4));
  const m = Number(startMonth.slice(5, 7));
  // Tag 0 des Folgemonats = letzter Tag des letzten Monats
  const end = new Date(Date.UTC(y, m - 1 + months, 0));
  return end.toISOString().slice(0, 10);
}

/** Benutzername normalisieren: trimmen, klein. Gibt null zurück, wenn Zeichen außerhalb `a-z 0-9 . _ -` vorkommen. */
export function normalizeUsername(input: string): string | null {
  const name = input.trim().toLowerCase();
  return /^[a-z0-9._-]{1,40}$/.test(name) ? name : null;
}
