import { Outlet } from 'react-router';
import { useLang } from '../i18n/t';
import { useMedia } from '../platform/use-media';
import styles from './AppShell.module.css';
import { Sidebar } from './Sidebar';
import { Tabbar } from './Tabbar';

export function AppShell() {
  useLang();
  const desktop = useMedia('(min-width: 1024px)');
  return (
    <div className={styles.shell}>
      {desktop ? <Sidebar /> : null}
      <main className={styles.main}>
        <Outlet />
      </main>
      {desktop ? null : <Tabbar />}
    </div>
  );
}
