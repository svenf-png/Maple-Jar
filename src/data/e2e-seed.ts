// Nur im E2E-Build (VITE_E2E=1, geladen aus main.tsx): Zugriff auf Datenbank und Aktionen für Testdaten, die
// ohne die Formulare entstehen sollen (Einnahmen, Fixkosten, Sparziele). Im Produktions-Build entfällt dieses Modul.
import * as actions from './actions';
import { db } from './db';

declare global {
  interface Window {
    __e2e?: { db: typeof db; actions: typeof actions };
  }
}

window.__e2e = { db, actions };
