import { Link, Outlet } from 'react-router';

export function Layout() {
  return (
    <>
      <nav>
        <Link to="/">Lobby</Link> <Link to="/reservations">Réservations</Link>{' '}
        <Link to="/account">Compte</Link> <Link to="/login">Connexion</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
