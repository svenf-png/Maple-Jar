import { PageHeader } from '../../app/PageHeader';
import { t, useLang } from '../../i18n/t';
import { useMedia } from '../../platform/use-media';
import { EmptyState } from '../../ui';

/** Stub (Fundament M3-B): B1 füllt die Seite. */
export function PlanningPage() {
  useLang();
  const desktop = useMedia('(min-width: 1024px)');
  return (
    <>
      <PageHeader title={t('plan.title')} showMeta={!desktop} />
      <EmptyState title={t('plan.title')} text={t('plan.stub')} />
    </>
  );
}
