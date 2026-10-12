import { NavLink } from 'react-router';
import { findMember } from '../data/household';
import { useReadySession } from '../data/use-session';
import { t } from '../i18n/t';
import { Logo } from '../icons/logo';
import { PlusIcon } from '../icons/ui-icons';
import { Avatar, useToast } from '../ui';
import { navItems } from './nav-items';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const toast = useToast();
  const { household, userId } = useReadySession();
  const me = findMember(household, userId);
  return (
    <aside className={styles.side}>
      <div className={styles.brand}>
        <span className={styles.tile}>
          <Logo size={22} />
        </span>
        <span className={styles.name}>{t('app.name')}</span>
      </div>
      <nav aria-label={t('nav.main')} className={styles.nav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={styles.link ?? ''}
            >
              <Icon size={20} />
              {t(item.label)}
            </NavLink>
          );
        })}
      </nav>
      <button type="button" className={styles.capture} onClick={() => toast(t('toast.comingM2'))}>
        <PlusIcon size={18} />
        {t('nav.capture')}
      </button>
      {me ? (
        <div className={styles.user}>
          <Avatar name={me.displayName} color={me.color} size={32} />
          <span>{me.displayName}</span>
        </div>
      ) : null}
    </aside>
  );
}
