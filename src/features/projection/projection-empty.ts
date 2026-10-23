interface Live {
  deleted: boolean;
}

/** Wahr, wenn die Projektion nichts zu rechnen hat: keine Einnahmen, Fixkosten, Ausgaben und Budgets (ohne gelöschte). */
export function isProjectionEmpty(rows: {
  incomes: readonly Live[];
  fixedCosts: readonly Live[];
  entries: readonly Live[];
  budgets: readonly Live[];
}): boolean {
  const live = (list: readonly Live[]) => list.some((r) => !r.deleted);
  return !(live(rows.incomes) || live(rows.fixedCosts) || live(rows.entries) || live(rows.budgets));
}
