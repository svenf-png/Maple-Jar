import { t, useLang } from '../../i18n/t';
import { EmptyState } from '../../ui';

/** Stub (Fundament M3-B): B1 füllt die Seite. */
export function GoalFormPage() {
  useLang();
  return (
    <main>
      <h1 className="type-large-title">{t('goal.new.title')}</h1>
      <EmptyState title={t('plan.title')} text={t('plan.stub')} />
    </main>
  );
}
