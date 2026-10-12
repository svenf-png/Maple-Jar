import type { MessageKey } from '../i18n/de';
import { t, useLang } from '../i18n/t';
import { useMedia } from '../platform/use-media';
import { EmptyState } from '../ui';
import { PageHeader } from './PageHeader';

export function PlaceholderPage({ title, hint }: { title: MessageKey; hint: MessageKey }) {
  useLang();
  const desktop = useMedia('(min-width: 1024px)');
  return (
    <>
      <PageHeader title={t(title)} showMeta={!desktop} />
      <EmptyState title={t('page.empty.title')} text={t(hint)} />
    </>
  );
}
