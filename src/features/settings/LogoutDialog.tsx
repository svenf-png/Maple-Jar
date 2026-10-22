import { useState } from 'react';
import { disconnect, PendingDataError } from '../../data/session';
import { retrySync } from '../../data/sync/control';
import { t, useLang } from '../../i18n/t';
import { ConfirmDialog } from '../../ui';

/** Nur hier gebraucht und deshalb im lazy geladenen Einstellungs-Chunk statt im globalen Wörterbuch (Größenbudget). */
const texts = {
  de: {
    pending: 'Noch nicht synchronisiert: {count}. Beim Abmelden gehen sie verloren.',
    syncFirst: 'Erst synchronisieren',
    discard: 'Trotzdem abmelden',
    error: 'Abmelden fehlgeschlagen.',
  },
  en: {
    pending: 'Not yet synced: {count}. Signing out discards them.',
    syncFirst: 'Sync first',
    discard: 'Sign out anyway',
    error: 'Signing out failed.',
  },
} as const;

export const useLogoutTexts = () => texts[useLang()];

interface Props {
  open: boolean;
  /** Live-Anzahl ungesendeter Ereignisse; wird beim Öffnen eingefroren. */
  pending: number;
  onOpenChange: (open: boolean) => void;
  onError: () => void;
}

/** Abmelde-Dialog: Anzahl beim Öffnen einfrieren, damit Text und Knöpfe unter dem Finger stabil bleiben. */
export function LogoutDialog({ open, pending, onOpenChange, onError }: Props) {
  const L = useLogoutTexts();
  const [snapshot, setSnapshot] = useState(pending);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSnapshot(pending);
  }
  return (
    <ConfirmDialog
      open={open}
      title={t('settings.logout.confirmTitle')}
      text={
        snapshot > 0
          ? L.pending.replace('{count}', String(snapshot))
          : t('settings.logout.confirmText')
      }
      confirmLabel={snapshot > 0 ? L.discard : t('settings.logout.confirm')}
      altLabel={snapshot > 0 ? L.syncFirst : undefined}
      onAlt={() => {
        onOpenChange(false);
        retrySync();
      }}
      onCancel={() => onOpenChange(false)}
      onConfirm={() => {
        onOpenChange(false);
        disconnect({ discardPending: snapshot > 0 }).catch((e: unknown) => {
          // Outbox hat sich inzwischen gefüllt: Dialog mit aktueller Anzahl erneut zeigen
          if (e instanceof PendingDataError) onOpenChange(true);
          else onError();
        });
      }}
    />
  );
}
