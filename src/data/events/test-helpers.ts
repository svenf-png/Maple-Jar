import { formatHlc } from './hlc';
import type { AppEvent, Entity, Op } from './schema';

export const DEV_A = '00000000-0000-4000-8000-0000000000d1';
export const DEV_B = '00000000-0000-4000-8000-0000000000d2';
export const USER_A = '00000000-0000-4000-8000-0000000000a1';
export const USER_B = '00000000-0000-4000-8000-0000000000b1';
export const CAT_1 = '00000000-0000-4000-8000-0000000000c1';
export const ROW_1 = '00000000-0000-4000-8000-000000000101';

let counter = 0;
export const uuid = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export const T0 = Date.UTC(2027, 0, 1, 12, 0, 0);

interface Make {
  id?: string;
  entity?: Entity;
  rowId?: string;
  op?: Op;
  data?: Record<string, unknown>;
  base?: string[];
  /** Millisekunden nach T0 */
  at?: number;
  device?: string;
  author?: string;
}

export function mk(m: Make): AppEvent {
  const device = m.device ?? DEV_A;
  return {
    v: 1,
    id: m.id ?? uuid(),
    hlc: formatHlc({ ms: T0 + (m.at ?? 0), counter: 0 }, device),
    device,
    author: m.author ?? (device === DEV_A ? USER_A : USER_B),
    entity: m.entity ?? 'entry',
    rowId: m.rowId ?? ROW_1,
    op: m.op ?? 'update',
    base: m.base ?? [],
    ...(m.data ? { data: m.data } : {}),
  };
}

export const entryData = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  amountMinor: 8417,
  currency: 'CAD',
  fxRateMicro: 1_000_000,
  fxRateDate: '2027-01-02',
  fxProvisional: false,
  bookedOn: '2027-01-02',
  categoryId: CAT_1,
  paidBy: USER_A,
  merchant: 'Supermarkt A',
  note: '',
  source: 'manual',
  ...over,
});

export const categoryData = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Lebensmittel',
  icon: 'lebensmittel',
  color: '#2F7D4F',
  sort: 0,
  hidden: false,
  ...over,
});
