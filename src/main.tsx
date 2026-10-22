import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/router';
import { loadSession } from './data/session';
import { initSyncRuntime } from './data/sync/control';
import { initLang } from './i18n/t';
import { requestPersistence } from './platform/persist';
import { registerServiceWorker } from './platform/sw-update';
import { initTheme } from './platform/theme';
import './styles/tokens.css';
import './styles/base.css';
import { ToastProvider } from './ui';

initTheme();
initLang();
void requestPersistence();
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Eigene Registrierung (Datei statt Inline-Skript, ohne workbox-window). registerType 'prompt': Der neue Worker wartet,
  // bis der Hinweis „Neue Version verfügbar“ bestätigt wird (kein skipWaiting, kein Reload ohne Tipp).
  registerServiceWorker();
}
void loadSession().then(initSyncRuntime);
if (import.meta.env.VITE_E2E === '1') void import('./data/e2e-seed');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </StrictMode>,
  );
}
