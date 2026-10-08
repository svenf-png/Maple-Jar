import type { ReactNode } from 'react';
import { ChevronRightIcon } from '../icons/ui-icons';
import styles from './ListRow.module.css';

interface Props {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
  size?: 'settings' | 'entry';
}

export function ListRow({ icon, title, subtitle, right, chevron, size = 'settings' }: Props) {
  return (
    <div className={`${styles.row} ${size === 'entry' ? styles.entry : styles.settings}`}>
      {icon ? <div className={styles.icon}>{icon}</div> : null}
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
      {right ? <div className={styles.right}>{right}</div> : null}
      {chevron ? (
        <span className={styles.chevron}>
          <ChevronRightIcon size={18} />
        </span>
      ) : null}
    </div>
  );
}
