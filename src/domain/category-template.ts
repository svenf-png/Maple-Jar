import type { CategoryIconKey } from '../icons/category-icons';

export interface CategoryTemplateEntry {
  key: string;
  de: string;
  en: string;
  color: string;
  icon: CategoryIconKey;
}

/** Generische Startkategorien. In M1 noch nicht angewendet (ab M2 in „Haushalt einrichten“). */
export const categoryTemplate: readonly CategoryTemplateEntry[] = [
  { key: 'groceries', de: 'Lebensmittel', en: 'Groceries', color: '#2F7D4F', icon: 'lebensmittel' },
  {
    key: 'dining',
    de: 'Restaurant und Café',
    en: 'Restaurants & cafés',
    color: '#A2456E',
    icon: 'restaurant',
  },
  {
    key: 'household',
    de: 'Haushalt und Drogerie',
    en: 'Household & drugstore',
    color: '#2C6CB0',
    icon: 'haushalt',
  },
  {
    key: 'leisure',
    de: 'Freizeit und Ausflüge',
    en: 'Leisure & outings',
    color: '#13857A',
    icon: 'freizeit',
  },
  { key: 'travel', de: 'Reisen', en: 'Travel', color: '#5B55B8', icon: 'reisen' },
  { key: 'clothing', de: 'Kleidung', en: 'Clothing', color: '#BF4F79', icon: 'kleidung' },
  { key: 'health', de: 'Gesundheit', en: 'Health', color: '#667F1C', icon: 'gesundheit' },
  { key: 'transport', de: 'Mobilität', en: 'Transportation', color: '#4F6F8F', icon: 'mobilitaet' },
  {
    key: 'phone',
    de: 'Kommunikation und Abos',
    en: 'Phone & subscriptions',
    color: '#8752B5',
    icon: 'kommunikation',
  },
  { key: 'gifts', de: 'Geschenke', en: 'Gifts', color: '#B4602F', icon: 'geschenke' },
  { key: 'other', de: 'Sonstiges', en: 'Other', color: '#7F7569', icon: 'sonstiges' },
];
