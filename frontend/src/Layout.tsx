import { Link, Outlet, useNavigate } from 'react-router';
import { useSession } from './lib/session/contexte';

export function Layout() {
  const { user, disconnect } = useSession();
  const navigate = useNavigate();

  async function seDeconnecter() {
    await disconnect();
    navigate('/login');
  }

  return (
    <>
      <nav>
        <Link to="/">Lobby</Link> <Link to="/reservations">Réservation</Link>{' '}
        <Link to="/account">Compte</Link>{' '}
        {user ? (
          <button type='button' onClick={seDeconnecter}>Déconnexion</button>
        ): (
          <Link to="/login">Connexion</Link>
        )}
      </nav>
      <main>
        <Outlet/>
      </main>
    </>
  )
}
