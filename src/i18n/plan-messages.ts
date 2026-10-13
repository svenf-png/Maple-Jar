import { registerMessages } from './t';

let loading: Promise<void> | undefined;

/** Lädt die Planungs-Texte (DE + EN) einmalig nach. Lazy Routen warten darauf vor dem Rendern. */
export function loadPlanMessages(): Promise<void> {
  loading ??= Promise.all([import('./plan-de'), import('./plan-en')]).then(([d, e]) => {
    registerMessages('de', d.planDe);
    registerMessages('en', e.planEn);
  });
  return loading;
}
