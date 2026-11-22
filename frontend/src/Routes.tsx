import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { LobbyPage } from './features/lobby/LobbyPage';
import { TablePage } from './features/table/TablePage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { AccountPage } from './features/account/AccountPage';
import { NotFoundPage } from './features/NotFoundPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { SafeRoute } from './SafeRoute';
import { chargerTable } from './features/table/loader';

import { AdminLayout } from './features/admin/AdminLayout';
import { CasinoLayout } from './features/admin/CasinoLayout';
import {
  AdminHomePage,
  CasinosPage,
  CasinoTablesPage,
  CasinoTablePage,
  CasinoReservationsPage,
  CasinoMembersPage,
  CasinoSettingsPage,
} from './features/admin/AdminPages';

export const router = createBrowserRouter([
  {
    path: '/',
    children: [
      // publiques
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },

      // safe
      {
        element: <SafeRoute />,
        children: [
          {
            element: <Layout />,
            children: [
              { index: true, element: <LobbyPage /> },
              { path: 'account', element: <AccountPage /> },
            ],
          },
            { path: 'tables/:tableId', element: <TablePage />, loader: chargerTable },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    element: <SafeRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminHomePage /> },
          { path: 'casinos', element: <CasinosPage /> },
          {
            path: 'casinos/:casinoId',
            element: <CasinoLayout />,
            children: [
              { index: true, element: <CasinoTablesPage /> },
              { path: 'tables/:tableId', element: <CasinoTablePage /> },
              { path: 'reservations', element: <CasinoReservationsPage /> },
              { path: 'members', element: <CasinoMembersPage /> },
              { path: 'settings', element: <CasinoSettingsPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
