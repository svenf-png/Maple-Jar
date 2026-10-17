import type { ComponentType } from 'react';
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ConnectPage } from '../features/connect/ConnectPage';
import { loadPlanMessages } from '../i18n/plan-messages';
import { AppShell } from './AppShell';
import { RedirectIfConnected, RequireConnection, RequireHousehold } from './Guards';
import { SubShell } from './SubShell';

/** Lädt Seite und Planungs-Texte (M3) parallel; gerendert wird erst, wenn beides da ist. */
const withPlan = async (load: () => Promise<ComponentType>): Promise<ComponentType> =>
  (await Promise.all([load(), loadPlanMessages()]))[0];

/** Vollbild-Unterseiten (ohne Tabbar), alle nur mit Haushalt erreichbar. */
function subPages(): RouteObject[] {
  const page = (path: string, load: () => Promise<ComponentType>, plan = false): RouteObject => ({
    path,
    lazy: async () => {
      const Component = await (plan ? withPlan(load) : load());
      return {
        element: (
          <RequireHousehold>
            <SubShell>
              <Component />
            </SubShell>
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
    ...planPages(page),
  ];
}

type PageFactory = (
  path: string,
  load: () => Promise<ComponentType>,
  plan?: boolean,
) => RouteObject;

/** M3-Unterseiten (Planung); alle laden die Planungs-Texte vor dem Rendern. */
function planPages(page: PageFactory): RouteObject[] {
  const goalForm = async () => (await import('../features/planning/GoalFormPage')).GoalFormPage;
  const fixedForm = async () =>
    (await import('../features/planning/FixedCostFormPage')).FixedCostFormPage;
  const incomeForm = async () =>
    (await import('../features/planning/IncomeFormPage')).IncomeFormPage;
  return [
    page('/ziel/neu', goalForm, true),
    page('/ziel/:id/bearbeiten', goalForm, true),
    page(
      '/ziel/:id',
      async () => (await import('../features/planning/GoalDetailPage')).GoalDetailPage,
      true,
    ),
    page('/fixkosten/neu', fixedForm, true),
    page('/fixkosten/:id', fixedForm, true),
    page('/einnahme/neu', incomeForm, true),
    page('/einnahme/:id', incomeForm, true),
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
          Component: await withPlan(
            async () => (await import('../features/overview/OverviewPage')).OverviewPage,
          ),
        }),
      },
      {
        path: 'verlauf',
        lazy: async () => ({
          Component: await withPlan(
            async () => (await import('../features/history/HistoryPage')).HistoryPage,
          ),
        }),
      },
      {
        path: 'planung',
        lazy: async () => ({
          Component: await withPlan(
            async () => (await import('../features/planning/PlanningPage')).PlanningPage,
          ),
        }),
      },
      {
        path: 'planung/projektion',
        lazy: async () => ({
          Component: await withPlan(
            async () => (await import('../features/projection/ProjectionPage')).ProjectionPage,
          ),
        }),
      },
      {
        path: 'einstellungen',
        lazy: async () => ({
          Component: await withPlan(
            async () => (await import('../features/settings/SettingsPage')).SettingsPage,
          ),
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
