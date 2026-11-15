import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { LobbyPage } from './features/lobby/LobbyPage';
import { TablePage } from './features/table/TablePage';
import { ReservationPage } from './features/booking/ReservationPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { AccountPage } from './features/account/AccountPage';
import { NotFoundPage } from './features/NotFoundPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { SafeRoute } from './SafeRoute';


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
              { path: 'reservations', element: <ReservationPage /> },
              { path: 'account', element: <AccountPage /> },
            ],
          },
          { path: 'tables/:tableId', element: <TablePage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
