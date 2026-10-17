import {
  type Budget,
  type Category,
  type Entry,
  type FixedCost,
  type Goal,
  type GoalContribution,
  type Income,
  SCENARIO_ID,
  type Scenario,
} from './model';

export const CAT_A = '00000000-0000-4000-8000-0000000000c1';
export const CAT_B = '00000000-0000-4000-8000-0000000000c2';
export const ME = '00000000-0000-4000-8000-0000000000a1';
export const OTHER = '00000000-0000-4000-8000-0000000000b1';

let n = 0;
export const entry = (over: Partial<Entry> = {}): Entry => ({
  id: `e-${++n}`,
  amountMinor: 1000,
  currency: 'CAD',
  fxRateMicro: 1_000_000,
  fxRateDate: '2027-02-10',
  fxProvisional: false,
  bookedOn: '2027-02-10',
  categoryId: CAT_A,
  paidBy: ME,
  merchant: 'Supermarkt A',
  note: '',
  source: 'manual',
  deleted: false,
  conflict: false,
  hlc: `2027-02-10T12:00:00.000Z-${String(n).padStart(4, '0')}-d`,
  createdBy: ME,
  ...over,
});

export const category = (over: Partial<Category> = {}): Category => ({
  id: CAT_A,
  name: 'Lebensmittel',
  icon: 'lebensmittel',
  color: '#2F7D4F',
  sort: 0,
  hidden: false,
  deleted: false,
  ...over,
});

export const budget = (over: Partial<Budget> = {}): Budget => ({
  id: `b-${++n}`,
  categoryId: CAT_A,
  validFrom: '2027-01-01',
  monthlyLimitCadMinor: 100_000,
  deleted: false,
  hlc: `2027-01-01T00:00:00.000Z-${String(n).padStart(4, '0')}-d`,
  ...over,
});

export const income = (over: Partial<Income> = {}): Income => ({
  id: `i-${++n}`,
  name: 'Gehalt A',
  amountMinor: 300_000,
  currency: 'CAD',
  unit: 'month',
  every: 1,
  startsOn: '2027-01-01',
  deleted: false,
  conflict: false,
  hlc: `2027-01-01T00:00:00.000Z-${String(n).padStart(4, '0')}-d`,
  ...over,
});

export const fixedCost = (over: Partial<FixedCost> = {}): FixedCost => ({
  id: `f-${++n}`,
  name: 'Miete A',
  amountMinor: 120_000,
  currency: 'CAD',
  categoryId: CAT_A,
  unit: 'month',
  every: 1,
  startsOn: '2027-01-01',
  isSaving: false,
  autobook: false,
  deleted: false,
  conflict: false,
  hlc: `2027-01-01T00:00:00.000Z-${String(n).padStart(4, '0')}-d`,
  ...over,
});

export const goal = (over: Partial<Goal> = {}): Goal => ({
  id: `g-${++n}`,
  name: 'Sparziel A',
  icon: 'ziel',
  color: '#2F7D4F',
  targetMinor: 120_000,
  currency: 'CAD',
  startsOn: '2027-01-01',
  targetDate: '2027-12-31',
  deleted: false,
  conflict: false,
  hlc: `2027-01-01T00:00:00.000Z-${String(n).padStart(4, '0')}-d`,
  ...over,
});

export const contribution = (over: Partial<GoalContribution> = {}): GoalContribution => ({
  id: `c-${++n}`,
  goalId: 'g-1',
  amountMinor: 10_000,
  contributedOn: '2027-02-10',
  note: '',
  deleted: false,
  hlc: `2027-02-10T12:00:00.000Z-${String(n).padStart(4, '0')}-d`,
  ...over,
});

export const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: SCENARIO_ID,
  categoryPct: {},
  extras: [],
  deleted: false,
  hlc: '2027-01-01T00:00:00.000Z-0000-d',
  ...over,
});
