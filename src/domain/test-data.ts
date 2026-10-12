import type { Budget, Category, Entry } from './model';

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
