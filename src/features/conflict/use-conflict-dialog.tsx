import { type ReactNode, useCallback, useState } from 'react';
import type { ConflictEntity } from '../../data/conflict-actions';
import { loadPlanMessages } from '../../i18n/plan-messages';

type DialogComponent = typeof import('./ConflictDialog').ConflictDialog;

/** Öffnet den Konflikt-Dialog lazy (Texte und Chunk werden erst beim Öffnen geladen). */
export function useConflictDialog(entity: ConflictEntity, rowId: string) {
  const [Dialog, setDialog] = useState<DialogComponent | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback(async () => {
    await loadPlanMessages();
    const { ConflictDialog } = await import('./ConflictDialog');
    setDialog(() => ConflictDialog);
    setOpen(true);
  }, []);
  const dialog: ReactNode = Dialog ? (
    <Dialog entity={entity} rowId={rowId} open={open} onClose={() => setOpen(false)} />
  ) : null;
  return { show, dialog };
}
