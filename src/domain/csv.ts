import { type Category, type Entry, entryCad } from './model';
import { minorToDecimal } from './money';

export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';

export interface CsvLabels {
  headers: readonly [string, string, string, string, string, string, string, string, string];
  source: { manual: string; fixed: string };
}

export interface CsvInput {
  entries: readonly Entry[];
  categories: readonly Pick<Category, 'id' | 'name'>[];
  members: readonly { userId: string; displayName: string }[];
  labels: CsvLabels;
}

const FORMULA = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[;"\r\n]/;

/**
 * Textzelle für CSV. Zuerst Schutz gegen Formeln (führendes `'`), danach Quoting,
 * damit auch ein so geschützter Text mit `;` oder Zeilenumbruch korrekt gequotet wird.
 */
export function csvText(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const byBookedOnThenHlc = (a: Entry, b: Entry): number => {
  if (a.bookedOn !== b.bookedOn) return a.bookedOn < b.bookedOn ? -1 : 1;
  if (a.hlc !== b.hlc) return a.hlc < b.hlc ? -1 : 1;
  return 0;
};

/** Einträge als CSV (Trenner `;`, Zeilenende `\r\n`, UTF-8 mit BOM). Gelöschte Einträge fehlen. */
export function entriesToCsv(input: CsvInput): string {
  const { labels } = input;
  const categoryNames = new Map(input.categories.map((c) => [c.id, c.name]));
  const memberNames = new Map(input.members.map((m) => [m.userId, m.displayName]));

  const rows = input.entries
    .filter((e) => !e.deleted)
    .slice()
    .sort(byBookedOnThenHlc)
    .map((e) =>
      [
        e.bookedOn,
        csvText(e.merchant),
        csvText(e.note),
        csvText(categoryNames.get(e.categoryId) ?? ''),
        minorToDecimal(e.amountMinor),
        e.currency,
        minorToDecimal(entryCad(e)),
        csvText(memberNames.get(e.paidBy) ?? ''),
        e.source === 'fixed' ? labels.source.fixed : labels.source.manual,
      ].join(CSV_SEPARATOR),
    );

  const header = labels.headers.map(csvText).join(CSV_SEPARATOR);
  return CSV_BOM + [header, ...rows].map((line) => `${line}\r\n`).join('');
}
