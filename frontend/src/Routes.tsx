import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { LobbyPage } from './features/lobby/LobbyPage';
import { TablePage } from './features/table/TablePage';
import { ReservationPage } from './features/booking/ReservationPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { AccountPage } from './features/account/AccountPage';
import { NotFoundPage } from './features/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <LobbyPage /> },
      { path: 'tables/:tableId', element: <TablePage /> },
      { path: 'reservations', element: <ReservationPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
