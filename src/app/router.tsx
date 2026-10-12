import type { ComponentType } from 'react';
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ConnectPage } from '../features/connect/ConnectPage';
import { AppShell } from './AppShell';
import { RedirectIfConnected, RequireConnection, RequireHousehold } from './Guards';
import { PlaceholderPage } from './PlaceholderPage';

/** Vollbild-Unterseiten (ohne Tabbar), alle nur mit Haushalt erreichbar. */
function subPages(): RouteObject[] {
  const page = (path: string, load: () => Promise<ComponentType>): RouteObject => ({
    path,
    lazy: async () => {
      const Component = await load();
      return {
        element: (
          <RequireHousehold>
            <Component />
          </RequireHousehold>
        ),
      };
    },
  });
  return [
    page('/erfassen', async () => (await import('../features/capture/CapturePage')).CapturePage),
    page(
      '/eintrag/:id/bearbeiten',
      async () => (await import('../features/capture/CapturePage')).CapturePage,
    ),
    page(
      '/eintrag/:id',
      async () => (await import('../features/history/EntryDetailPage')).EntryDetailPage,
    ),
    page('/budgets', async () => (await import('../features/budgets/BudgetsPage')).BudgetsPage),
    page(
      '/kategorien',
      async () => (await import('../features/categories/CategoriesPage')).CategoriesPage,
    ),
  ];
}

const router = createHashRouter([
  {
    path: '/verbinden',
    element: (
      <RedirectIfConnected>
        <ConnectPage />
      </RedirectIfConnected>
    ),
  },
  {
    path: '/hilfe',
    lazy: async () => ({ Component: (await import('../features/connect/HelpPage')).HelpPage }),
  },
  {
    path: '/einrichten',
    lazy: async () => {
      const { SetupPage } = await import('../features/setup/SetupPage');
      return {
        element: (
          <RequireConnection stage="setup">
            <SetupPage />
          </RequireConnection>
        ),
      };
    },
  },
  {
    path: '/beitreten',
    lazy: async () => {
      const { JoinPage } = await import('../features/setup/JoinPage');
      return {
        element: (
          <RequireConnection stage="join">
            <JoinPage />
          </RequireConnection>
        ),
      };
    },
  },
  {
    path: '/anmelden',
    lazy: async () => {
      const { RenewPage } = await import('../features/connect/RenewPage');
      return {
        element: (
          <RequireHousehold>
            <RenewPage />
          </RequireHousehold>
        ),
      };
    },
  },
  {
    path: '/',
    element: (
      <RequireHousehold>
        <AppShell />
      </RequireHousehold>
    ),
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('../features/overview/OverviewPage')).OverviewPage,
        }),
      },
      {
        path: 'verlauf',
        lazy: async () => ({
          Component: (await import('../features/history/HistoryPage')).HistoryPage,
        }),
      },
      {
        path: 'planung',
        element: <PlaceholderPage title="nav.planning" hint="page.planning.hint" />,
      },
      {
        path: 'einstellungen',
        lazy: async () => ({
          Component: (await import('../features/settings/SettingsPage')).SettingsPage,
        }),
      },
    ],
  },
  ...subPages(),
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
