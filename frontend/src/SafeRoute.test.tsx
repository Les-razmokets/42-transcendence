import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import type { MyProfileWithMemberships } from '@transcendence/shared';
import { SessionContext, type Session } from '@/lib/session/contexte';
import { SafeRoute } from './SafeRoute';

const joueur: MyProfileWithMemberships = {
  id: 'user-1',
  email: 'joueur@exemple.ch',
  pseudo: 'joueur',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: null,
  birthDate: '1990-01-01T00:00:00.000Z',
  role: 'USER',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  memberships: [{ casinoId: 'casino-1', casinoName: 'Casino du lac', role: 'FLOOR' }],
};

// Fausse page login qui affiche le `from` reçu dans le state de navigation,
// pour vérifier ce que SafeRoute lui transmet.
function FauxLogin() {
  const location = useLocation();
  return (
    <>
      <p>Page login</p>
      <p>from : {location.state?.from ?? 'aucun'}</p>
    </>
  );
}

// Pas besoin du vrai SessionProvider : on remplit la "boîte" à la main
// avec l'état qu'on veut tester.
function renderSafeRoute(session: Partial<Session>, url = '/') {
  const valeur: Session = {
    user: null,
    load: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...session,
  };

  return render(
    <SessionContext.Provider value={valeur}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<FauxLogin />} />
          <Route element={<SafeRoute />}>
            <Route path="/" element={<p>Page lobby</p>} />
            <Route path="/reservations" element={<p>Page réservations</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe('SafeRoute', () => {
  it('affiche la page protégée si un utilisateur est connecté', () => {
    renderSafeRoute({ user: joueur });

    expect(screen.getByText('Page lobby')).toBeInTheDocument();
    expect(screen.queryByText('Page login')).not.toBeInTheDocument();
  });

  it("affiche la bonne page enfant selon l'URL", () => {
    renderSafeRoute({ user: joueur }, '/reservations');

    expect(screen.getByText('Page réservations')).toBeInTheDocument();
    expect(screen.queryByText('Page lobby')).not.toBeInTheDocument();
  });

  it("redirige vers /login si personne n'est connecté", () => {
    renderSafeRoute({ user: null }, '/reservations');

    expect(screen.getByText('Page login')).toBeInTheDocument();
    expect(screen.queryByText('Page réservations')).not.toBeInTheDocument();
  });

  it('transmet la page demandée (from) à /login', () => {
    renderSafeRoute({ user: null }, '/reservations');

    expect(screen.getByText('from : /reservations')).toBeInTheDocument();
  });

  it('transmet aussi from quand la page demandée est le lobby', () => {
    renderSafeRoute({ user: null }, '/');

    expect(screen.getByText('from : /')).toBeInTheDocument();
  });

  it("n'affiche rien et ne redirige pas tant que la session charge", () => {
    renderSafeRoute({ user: null, load: true });

    // Le point clé : pendant /users/me, on ne doit PAS renvoyer vers /login,
    // sinon un F5 déconnecterait l'utilisateur.
    expect(screen.queryByText('Page login')).not.toBeInTheDocument();
    expect(screen.queryByText('Page lobby')).not.toBeInTheDocument();
  });

  it("n'affiche rien pendant le chargement, même avec un utilisateur", () => {
    renderSafeRoute({ user: joueur, load: true });

    expect(screen.queryByText('Page lobby')).not.toBeInTheDocument();
  });
});
