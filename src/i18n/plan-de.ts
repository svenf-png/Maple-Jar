// Lazy geladene Texte für Meilenstein 3 (Planung). Nicht aus dem Entry-Chunk importieren,
// nur über loadPlanMessages() (plan-messages.ts). Schlüssel flach mit Punkt-Präfix.
// Jeder Bereich hängt nur in seinem eigenen Abschnitt an (Merge-Konflikte vermeiden).
export const planDe = {
  // shared (Foundation)
  'plan.title': 'Planung',
  'plan.stub': 'In Arbeit',
  'plan.perMonth': '≈ {amount} / Monat',
  'plan.repeat.once': 'Einmalig',
  'plan.repeat.week': 'Wöchentlich',
  'plan.repeat.month': 'Monatlich',
  'plan.repeat.year': 'Jährlich',
  'plan.repeat.everyWeeks': 'Alle {n} Wochen',
  'plan.repeat.everyMonths': 'Alle {n} Monate',
  'plan.repeat.everyYears': 'Alle {n} Jahre',
  'due.today': 'Heute',
  'due.tomorrow': 'Morgen',
  'due.dayAfter': 'Übermorgen',
  'goal.status.ok': 'Im Plan',
  'goal.status.behind': 'Etwas zurück',
  'goal.status.reached': 'Erreicht',
  'goal.status.overdue': 'Überfällig',
  'goal.new.title': 'Neues Ziel',
  'goal.edit.title': 'Ziel bearbeiten',
  'goal.detail.title': 'Sparziel',
  'fixed.new.title': 'Neue Fixkosten',
  'fixed.edit.title': 'Fixkosten bearbeiten',
  'income.new.title': 'Neue Einnahme',
  'income.edit.title': 'Einnahme bearbeiten',
  'donut.title': 'Anteil am Einkommen',
  'conflict.title': 'Konflikt lösen',

  // planning (B1)

  // overview (B2)

  // conflict (B3)
} as const;

export type PlanKey = keyof typeof planDe;
