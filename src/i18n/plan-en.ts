import type { PlanKey } from './plan-de';

// Englisch zu plan-de.ts: gleiche Schlüssel, gleiche Platzhalter, gleiche Abschnitte.
export const planEn: Record<PlanKey, string> = {
  // shared (Foundation)
  'plan.title': 'Planning',
  'plan.stub': 'Work in progress',
  'plan.perMonth': '≈ {amount} / month',
  'plan.repeat.once': 'One-time',
  'plan.repeat.week': 'Weekly',
  'plan.repeat.month': 'Monthly',
  'plan.repeat.year': 'Yearly',
  'plan.repeat.everyWeeks': 'Every {n} weeks',
  'plan.repeat.everyMonths': 'Every {n} months',
  'plan.repeat.everyYears': 'Every {n} years',
  'due.today': 'Today',
  'due.tomorrow': 'Tomorrow',
  'due.dayAfter': 'Day after tomorrow',
  'goal.status.ok': 'On track',
  'goal.status.behind': 'A bit behind',
  'goal.status.reached': 'Reached',
  'goal.status.overdue': 'Overdue',
  'goal.new.title': 'New goal',
  'goal.edit.title': 'Edit goal',
  'goal.detail.title': 'Savings goal',
  'fixed.new.title': 'New fixed cost',
  'fixed.edit.title': 'Edit fixed cost',
  'income.new.title': 'New income',
  'income.edit.title': 'Edit income',
  'donut.title': 'Share of income',
  'conflict.title': 'Resolve conflict',

  // planning (B1)

  // overview (B2)

  // conflict (B3)
};
