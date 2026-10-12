import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ConnectPage } from '../features/connect/ConnectPage';
import { AppShell } from './AppShell';
import { RedirectIfConnected, RequireConnection, RequireHousehold } from './Guards';
import { PlaceholderPage } from './PlaceholderPage';

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
      { index: true, element: <PlaceholderPage title="nav.overview" hint="page.overview.hint" /> },
      {
        path: 'verlauf',
        element: <PlaceholderPage title="nav.history" hint="page.history.hint" />,
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
  {
    path: '*',
    element: (
      <RequireHousehold>
        <PlaceholderPage title="nav.overview" hint="page.overview.hint" />
      </RequireHousehold>
    ),
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
