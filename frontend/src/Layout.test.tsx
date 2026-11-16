import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import type { MyProfileWithMemberships } from '@transcendence/shared';
import '@/lib/i18n';
import { SessionContext, type Session } from '@/lib/session/contexte';
import { Layout } from './Layout';

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

function renderLayout(user: MyProfileWithMemberships | null) {
  const valeur: Session = {
    user,
    load: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  return render(
    <SessionContext.Provider value={valeur}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p>Page lobby</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe('Layout', () => {
  it("affiche la page de l'URL dans le <main>", () => {
    renderLayout(joueur);

    expect(screen.getByRole('main')).toHaveTextContent('Page lobby');
  });

  it("affiche l'en-tête avec les initiales de l'utilisateur", () => {
    renderLayout(joueur);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveTextContent('JD');
  });

  it("le lien de l'avatar mène à /account", () => {
    renderLayout(joueur);

    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveAttribute('href', '/account');
  });

  it("n'affiche rien si personne n'est connecté", () => {
    const { container } = renderLayout(null);

    expect(container).toBeEmptyDOMElement();
  });
});
