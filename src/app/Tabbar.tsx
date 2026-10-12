import { NavLink, useNavigate } from 'react-router';
import { t } from '../i18n/t';
import { Button } from '../ui';
import { navItems } from './nav-items';
import styles from './Tabbar.module.css';

export function Tabbar() {
  const navigate = useNavigate();
  const [overview, history, planning, settings] = navItems;
  const link = (item: (typeof navItems)[number] | undefined) => {
    if (!item) return null;
    const Icon = item.icon;
    return (
      <NavLink to={item.to} end={item.end ?? false} className={styles.item ?? ''}>
        <Icon size={24} />
        <span className={styles.text}>{t(item.label)}</span>
      </NavLink>
    );
  };
  return (
    <nav className={styles.bar} aria-label={t('nav.main')}>
      {link(overview)}
      {link(history)}
      <div className={styles.center}>
        <Button
          variant="fab"
          className={styles.fab}
          aria-label={t('nav.capture')}
          onClick={() => void navigate('/erfassen')}
        />
      </div>
      {link(planning)}
      {link(settings)}
    </nav>
  );
}
