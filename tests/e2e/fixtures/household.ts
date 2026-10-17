// Testdaten: ausschließlich neutrale Platzhalter.
export const PROJECT_URL = 'https://e2e-project.supabase.co';
export const ANON_KEY = 'e2e-public-key';

export const PERSON_A = {
  username: 'person-a',
  password: 'e2e-pass-one-1',
  userId: '00000000-0000-4000-8000-0000000000a1',
  displayName: 'Person A',
  color: '#2C6CB0',
} as const;
export const PERSON_B = {
  username: 'person-b',
  password: 'e2e-pass-two-2',
  userId: '00000000-0000-4000-8000-0000000000b1',
  displayName: 'Person B',
  color: '#A2456E',
} as const;
export const PERSON_C = {
  username: 'person-c',
  password: 'e2e-pass-three-3',
  userId: '00000000-0000-4000-8000-0000000000c1',
  displayName: 'Person C',
  color: '#13857A',
} as const;

export const SETTINGS = {
  name: 'Testhaushalt',
  placeLabel: null,
  periodStart: '2027-01-01',
  periodEnd: '2027-12-31',
  baseCurrency: 'CAD',
  secondCurrency: 'EUR',
  fxProvider: 'ECB',
} as const;
