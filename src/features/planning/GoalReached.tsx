import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { getMeta, setMeta } from '../../data/db';
import { isReached } from '../../domain/goals';
import type { Goal } from '../../domain/model';
import { formatDay, formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { CategoryTile, StatusPill } from '../../ui';
import { HapticTarget } from '../../ui/HapticTarget';
import { BottomSheet } from '../shared/BottomSheet';
import styles from './GoalReached.module.css';
import { monthsSpan, reachedSeenKey, spanFrom } from './plan-helpers';

/**
 * Zeigt „Sparziel erreicht“ einmal pro Person und Ziel. Gemerkt wird lokal pro Gerät und Konto
 * (Dexie `meta`), eine zweite Anmeldung derselben Person auf einem anderen Gerät sieht es erneut.
 */
export function useGoalReached(goal: Goal | undefined, savedMinor: bigint, userId: string) {
  const [open, setOpen] = useState(false);
  const checked = useRef(new Set<string>());
  const reached = goal != null && goal.archivedAt == null && isReached(goal, savedMinor);
  const goalId = goal?.id;
  useEffect(() => {
    if (!reached || !goalId) return;
    const key = reachedSeenKey(goalId, userId);
    if (checked.current.has(key)) return;
    checked.current.add(key);
    void getMeta<boolean>(key).then(async (seen) => {
      if (seen) return;
      await setMeta(key, true);
      setOpen(true);
    });
  }, [reached, goalId, userId]);
  return { open, close: () => setOpen(false) };
}

const CONFETTI = ['--ok', '--info', '--warn', '--seg-fixed', '--seg-other', '--seg-budget'];

interface Props {
  goal: Goal;
  savedMinor: bigint;
  today: string;
  open: boolean;
  onClose: () => void;
}

export function GoalReached({ goal, savedMinor, today, open, onClose }: Props) {
  const locale = getLocale();
  const months = monthsSpan(goal.startsOn, today);
  const range = { from: spanFrom(goal.startsOn, today), to: today };
  const dayOpts = { month: 'short', year: 'numeric' } as const;
  const duration = t(months === 1 ? 'goal.reached.durationOne' : 'goal.reached.duration', {
    n: months,
    from: formatDay(range.from, locale, dayOpts),
    to: formatDay(range.to, locale, dayOpts),
  });
  return (
    <BottomSheet open={open} title={t('goal.reached.title', { name: goal.name })} onClose={onClose}>
      <div className={styles.body}>
        <div className={styles.confetti} aria-hidden="true">
          {CONFETTI.concat(CONFETTI).map((token, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: statische Dekoration
              key={i}
              className={styles.piece}
              style={{
                left: `${6 + ((i * 8) % 88)}%`,
                top: `${(i * 13) % 40}%`,
                background: `var(${token})`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <CategoryTile icon={goal.icon} color={goal.color} size={64} />
        <StatusPill variant="ok">{t('goal.reached.pill')}</StatusPill>
        <p className={`${styles.saved} num`}>
          {t('goal.reached.saved', { amount: formatMoney(savedMinor, goal.currency, locale) })}
        </p>
        <p className={styles.duration}>{duration}</p>
        <HapticTarget onTap={onClose}>{t('goal.reached.close')}</HapticTarget>
        <Link to="/ziel/neu" className={styles.next} onClick={onClose}>
          {t('goal.reached.next')}
        </Link>
      </div>
    </BottomSheet>
  );
}
