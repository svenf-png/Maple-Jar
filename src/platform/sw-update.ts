/** Update-Hinweis: fragt aktiv nach einer neuen Version und meldet einen wartenden Service Worker. */

export const UPDATE_CHECK_MIN_GAP_MS = 60_000;

/** Nur bei bereits aktivem Worker ohne laufende Installation nach Updates suchen (kein Fehlalarm bei Erstinstallation). */
export function canUpdate(reg: ServiceWorkerRegistration): boolean {
  return reg.active != null && reg.installing == null;
}

/** Sofort prüfen, danach bei Rückkehr in den Vordergrund höchstens einmal je Mindestabstand. */
export function startUpdateChecks(
  reg: ServiceWorkerRegistration,
  doc: Document,
  now: () => number = Date.now,
): void {
  let last = Number.NEGATIVE_INFINITY;
  const check = () => {
    if (!canUpdate(reg)) return;
    last = now();
    // Offline ist kein Fehler.
    reg.update().catch(() => undefined);
  };
  check();
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    if (now() - last < UPDATE_CHECK_MIN_GAP_MS) return;
    check();
  });
}

/**
 * Vollbild-Formulare ohne Tab-Leiste: Der Hinweis würde Felder und die Speichern-Schaltfläche verdecken.
 * Muster auf den Hash-Pfad (ohne Query), passend zu `subPages()` in `src/app/router.tsx`.
 */
export const FORM_PATHS: readonly RegExp[] = [
  /^\/erfassen$/,
  /^\/eintrag\/[^/]+\/bearbeiten$/,
  /^\/ziel\/neu$/,
  /^\/ziel\/[^/]+\/bearbeiten$/,
  /^\/fixkosten\/[^/]+$/,
  /^\/einnahme\/[^/]+$/,
];

export function isFormPath(pathname: string): boolean {
  return FORM_PATHS.some((re) => re.test(pathname));
}

/** Hinweis zeigen, wenn ein Update wartet und die Seite kein Vollbild-Formular ist. */
export function shouldShowUpdatePrompt(pending: boolean, pathname: string): boolean {
  return pending && !isFormPath(pathname);
}

/* ---------- Store ---------- */

let updateWaiting = false;
const listeners = new Set<() => void>();

function setUpdateWaiting(value: boolean): void {
  if (updateWaiting === value) return;
  updateWaiting = value;
  for (const l of listeners) l();
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** true = ein Update wartet und wurde nicht weggeklickt. */
export function getUpdateSnapshot(): boolean {
  return updateWaiting;
}

/** Blendet den Hinweis bis zum nächsten Laden der Seite aus. */
export function dismissUpdate(): void {
  setUpdateWaiting(false);
}

/** Meldet ein Update nur, wenn schon ein Worker die Seite steuert (nie bei der Erstinstallation). */
export function watchRegistration(
  reg: ServiceWorkerRegistration,
  sw: Pick<ServiceWorkerContainer, 'controller'> = navigator.serviceWorker,
): void {
  if (reg.waiting && sw.controller) setUpdateWaiting(true);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && sw.controller) setUpdateWaiting(true);
    });
  });
}

/** Aktiviert den wartenden Worker und lädt nach dem Wechsel genau einmal neu. */
export function applyUpdate(
  reg: ServiceWorkerRegistration,
  sw: Pick<ServiceWorkerContainer, 'addEventListener'> = navigator.serviceWorker,
  reload: () => void = () => location.reload(),
): void {
  if (!reg.waiting) {
    reload();
    return;
  }
  let reloaded = false;
  sw.addEventListener(
    'controllerchange',
    () => {
      if (reloaded) return;
      reloaded = true;
      reload();
    },
    { once: true },
  );
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}

let registration: ServiceWorkerRegistration | null = null;

/** Lädt die Seite mit der neuen Version neu (für den Hinweis). */
export function applyRegisteredUpdate(): void {
  if (registration) applyUpdate(registration);
  else location.reload();
}

export async function registerServiceWorker(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
    registration = reg;
    watchRegistration(reg);
    startUpdateChecks(reg, document);
  } catch {
    // Registrierung fehlgeschlagen: App läuft ohne Offline-Cache weiter.
  }
}
