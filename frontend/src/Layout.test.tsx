import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import type { MyProfileUser } from '@transcendence/shared';
import { SessionContext, type Session } from '@/lib/session/contexte';
import { Layout } from './Layout';

const joueur: MyProfileUser = {
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
};

function renderLayout(session: Partial<Session>) {
  const valeur: Session = {
    user: null,
    load: false,
    connect: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...session,
  };

  render(
    <SessionContext.Provider value={valeur}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p>Page lobby</p>} />
            <Route path="/login" element={<p>Page login</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );

  return valeur;
}

describe('Layout', () => {
  it("affiche la page de l'URL dans le <main>", () => {
    renderLayout({ user: joueur });

    expect(screen.getByRole('main')).toHaveTextContent('Page lobby');
  });

  it('affiche le lien Connexion si personne n\'est connecté', () => {
    renderLayout({ user: null });

    expect(screen.getByRole('link', { name: 'Connexion' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Déconnexion' })).not.toBeInTheDocument();
  });

  it('affiche le bouton Déconnexion si un utilisateur est connecté', () => {
    renderLayout({ user: joueur });

    expect(screen.getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connexion' })).not.toBeInTheDocument();
  });

  it('déconnecte puis renvoie vers /login au clic sur Déconnexion', async () => {
    const session = renderLayout({ user: joueur });

    await userEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));

    expect(session.disconnect).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Page login')).toBeInTheDocument();
  });
});
