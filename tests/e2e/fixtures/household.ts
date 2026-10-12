// Testdaten: ausschließlich neutrale Platzhalter.
export const PERSON_A = { githubLogin: 'person-a', displayName: 'Person A', color: '#2C6CB0' };
export const PERSON_B = { githubLogin: 'person-b', displayName: 'Person B', color: '#A2456E' };

export function householdJson(members: Array<typeof PERSON_A>): string {
  return `${JSON.stringify(
    {
      format: 1,
      householdId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2027-01-01T00:00:00.000Z',
      members,
      settings: {
        name: 'Testhaushalt',
        placeLabel: null,
        periodStart: '2027-01-01',
        periodEnd: '2027-12-31',
        baseCurrency: 'CAD',
        secondCurrency: 'EUR',
        fxProvider: 'ECB',
      },
    },
    null,
    2,
  )}\n`;
}

export const VALID_TOKEN = 'test-token';
export const REPO = 'org-x/repo-y';
