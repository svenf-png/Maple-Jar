import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { addContribution, archiveGoal, deleteContribution, updateGoal } from '../../data/actions';
import { db } from '../../data/db';
import { useContributions, useGoals, useLoaded } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { planDeviation, requiredMonthly, saved as sumSaved } from '../../domain/goals';
import type { GoalContribution } from '../../domain/model';
import { parseDecimalToMinor } from '../../domain/money';
import { formatDay, formatMoney } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { TrashIcon } from '../../icons/ui-icons';
import { Button, Card, CategoryTile, Segmented, TextField, useToast } from '../../ui';
import { ConflictBadge } from '../conflict/ConflictBadge';
import { BottomSheet } from '../shared/BottomSheet';
import { memberName, todayIso } from '../shared/helpers';
import { FormError } from './FormShell';
import { GoalStats } from './GoalParts';
import { GoalReached, useGoalReached } from './GoalReached';
import styles from './PlanningPage.module.css';
import { parseSignedMinor } from './plan-helpers';

const byNewest = (a: GoalContribution, b: GoalContribution) =>
  b.contributedOn.localeCompare(a.contributedOn) || b.hlc.localeCompare(a.hlc);

export function GoalDetailPage() {
  useLang();
  const locale = getLocale();
  const navigate = useNavigate();
  const toast = useToast();
  const { id = '' } = useParams();
  const { household, userId } = useReadySession();
  const goal = useGoals().find((g) => g.id === id && !g.deleted);
  const loaded = useLoaded();
  const contributions = useContributions()
    .filter((c) => c.goalId === id && !c.deleted)
    .sort(byNewest);
  const today = todayIso();
  const savedMinor = sumSaved(contributions);
  const reached = useGoalReached(goal, savedMinor, userId);

  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [member, setMember] = useState<string>(userId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  if (!goal) {
    return (
      <main className={styles.detail}>
        <Link to="/planung" className={styles.link}>
          {t('goal.detail.back')}
        </Link>
        {loaded ? <p className={styles.muted}>{t('goal.detail.notFound')}</p> : null}
      </main>
    );
  }

  const dev = planDeviation(goal, savedMinor, today);
  const suggestion = requiredMonthly(goal, savedMinor, today);
  const money = (minor: number | bigint) => formatMoney(minor, goal.currency, locale);

  async function add(input: {
    amountMinor: number;
    contributedOn: string;
    note: string;
    memberId: string;
  }) {
    // Doppeltipp-Schutz (Ref gilt sofort, State steuert die Anzeige).
    if (!goal || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await addContribution(db, {
        goalId: goal.id,
        amountMinor: input.amountMinor,
        contributedOn: input.contributedOn,
        note: input.note,
        ...(input.memberId ? { memberId: input.memberId } : {}),
      });
      toast(t('goal.contrib.added'));
      return true;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    const amountMinor = parseSignedMinor(amount, parseDecimalToMinor);
    if (!amountMinor) return setError(t('goal.contrib.error'));
    setError(null);
    if (!(await add({ amountMinor, contributedOn: date, note, memberId: member }))) return;
    setSheet(false);
    setAmount('');
    setNote('');
  }

  async function remove(c: GoalContribution) {
    await deleteContribution(db, c.id);
    toast(t('goal.contrib.deleted'), {
      label: t('history.undo'),
      // Beiträge lassen sich nicht wiederherstellen: derselbe Beitrag wird neu angelegt.
      onClick: () =>
        void addContribution(db, {
          goalId: c.goalId,
          amountMinor: c.amountMinor,
          contributedOn: c.contributedOn,
          note: c.note,
          ...(c.memberId ? { memberId: c.memberId } : {}),
        }),
    });
  }

  async function archive() {
    if (!goal) return;
    await archiveGoal(db, goal.id, today);
    toast(t('goal.detail.archived'), {
      label: t('history.undo'),
      onClick: () => void updateGoal(db, goal.id, { archivedAt: null }),
    });
    void navigate('/planung', { replace: true });
  }

  return (
    <main className={styles.detail}>
      <div className={styles.bar}>
        <Link to="/planung" className={styles.link}>
          {t('goal.detail.back')}
        </Link>
        <Link to={`/ziel/${goal.id}/bearbeiten`} className={styles.link}>
          {t('goal.detail.edit')}
        </Link>
      </div>
      <Card radius="hero" className={styles.hero}>
        <div className={styles.heroHead}>
          <CategoryTile icon={goal.icon} color={goal.color} size={52} />
          <div>
            <h1 className={styles.heroTitle}>{goal.name}</h1>
            <p className={styles.muted}>
              {t('goal.until', {
                date: formatDay(goal.targetDate, locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })}
            </p>
          </div>
        </div>
        <p className={`${styles.heroSaved} num`}>
          {t('goal.savedOf', { saved: money(savedMinor), target: money(goal.targetMinor) })}
        </p>
        <GoalStats goal={goal} savedMinor={savedMinor} dev={dev} today={today} />
        {goal.conflict ? <ConflictBadge entity="goal" rowId={goal.id} /> : null}
      </Card>

      {goal.archivedAt ? (
        <p className={styles.muted}>{t('goal.detail.archivedNote')}</p>
      ) : (
        <section className={styles.actions} aria-label={t('goal.detail.contribute')}>
          {suggestion > 0n ? (
            <Button
              variant="secondary"
              busy={busy}
              onClick={() =>
                void add({
                  amountMinor: Number(suggestion),
                  contributedOn: today,
                  note: '',
                  memberId: userId,
                })
              }
            >
              {t('goal.detail.suggested', { amount: money(suggestion) })}
            </Button>
          ) : null}
          <Button
            disabled={busy}
            onClick={() => {
              setError(null);
              setDate(today);
              setSheet(true);
            }}
          >
            {suggestion > 0n ? t('goal.detail.custom') : t('goal.detail.contribute')}
          </Button>
        </section>
      )}

      <section aria-labelledby="contrib-h">
        <h2 id="contrib-h" className={styles.sectionTitle}>
          {t('goal.detail.contributions')}
        </h2>
        {contributions.length === 0 ? (
          <p className={styles.muted}>{t('goal.detail.noContributions')}</p>
        ) : (
          <Card className={styles.list}>
            <ul className={styles.plain}>
              {contributions.map((c) => {
                const day = formatDay(c.contributedOn, locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                const who = c.memberId ? memberName(household.members, c.memberId) : '';
                const sub = [
                  who,
                  c.amountMinor < 0 ? t('goal.detail.withdrawal') : '',
                  c.note,
                ].filter(Boolean);
                return (
                  <li key={c.id} className={styles.contrib}>
                    <span className={styles.contribText}>
                      <span className={styles.rowTitle}>{day}</span>
                      {sub.length > 0 ? (
                        <span className={styles.rowSub}>{sub.join(' · ')}</span>
                      ) : null}
                    </span>
                    <span className={`${styles.amount} num`}>
                      {c.amountMinor > 0 ? '+ ' : ''}
                      {money(c.amountMinor)}
                    </span>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={t('goal.contrib.delete', {
                        amount: money(c.amountMinor),
                        date: day,
                      })}
                      onClick={() => void remove(c)}
                    >
                      <TrashIcon size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {goal.archivedAt ? null : (
        <Button variant="secondary" onClick={() => void archive()}>
          {t('goal.detail.archive')}
        </Button>
      )}

      <BottomSheet open={sheet} title={t('goal.detail.contribute')} onClose={() => setSheet(false)}>
        <div className={styles.sheetForm}>
          <TextField
            label={t('goal.contrib.amount', { currency: goal.currency })}
            hint={t('goal.contrib.amountHint')}
            inputMode="text"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField
            label={t('goal.contrib.date')}
            type="date"
            max="2099-12-31"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <TextField
            label={t('goal.contrib.note')}
            maxLength={500}
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className={styles.memberRow}>
            <span>{t('goal.contrib.member')}</span>
            <Segmented
              label={t('goal.contrib.member')}
              value={member}
              options={[
                ...household.members.map((m) => ({ value: m.userId, label: m.displayName })),
                { value: '', label: t('form.noMember') },
              ]}
              onChange={setMember}
            />
          </div>
          <FormError message={error} />
          <Button busy={busy} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
          <Button variant="secondary" onClick={() => setSheet(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </BottomSheet>

      <GoalReached
        goal={goal}
        savedMinor={savedMinor}
        today={today}
        open={reached.open}
        onClose={reached.close}
      />
    </main>
  );
}
