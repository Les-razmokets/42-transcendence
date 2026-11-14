import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyProfileWithMemberships } from '@transcendence/shared';
import { ApiError, request } from '@/lib/api';
import { SessionProvider } from './SessionProvider';
import { useSession } from './contexte';

// On garde la vraie classe ApiError, on ne remplace que request (le fetch).
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  request: vi.fn(),
}));

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

// Un petit composant qui lit la session et l'affiche, pour pouvoir
// vérifier ce que le Provider met dans la boîte.
function Lecteur() {
  const { user, load, connect, disconnect } = useSession();
  return (
    <>
      <p>{load ? 'chargement' : 'chargé'}</p>
      <p>{user ? `connecté : ${user.pseudo}` : 'déconnecté'}</p>
      <p>{user ? `memberships : ${user.memberships.length}` : ''}</p>
      <button onClick={() => connect().catch(() => {})}>connect</button>
      <button onClick={() => disconnect().catch(() => {})}>disconnect</button>
    </>
  );
}

function renderProvider() {
  return render(
    <SessionProvider>
      <Lecteur />
    </SessionProvider>,
  );
}

// Une promesse qu'on résout à la main, pour observer l'état "pendant" la requête.
function promesseEnAttente<T>() {
  let resoudre!: (valeur: T) => void;
  const promesse = new Promise<T>((r) => (resoudre = r));
  return { promesse, resoudre };
}

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
  });

  describe('au démarrage', () => {
    it('appelle GET /users/me', async () => {
      vi.mocked(request).mockResolvedValue(joueur);
      renderProvider();

      await screen.findByText('chargé');
      expect(request).toHaveBeenCalledWith('GET', '/users/me');
    });

    it('est en chargement tant que /users/me n\'a pas répondu', async () => {
      const { promesse, resoudre } = promesseEnAttente<MyProfileWithMemberships>();
      vi.mocked(request).mockReturnValue(promesse);
      renderProvider();

      expect(screen.getByText('chargement')).toBeInTheDocument();
      expect(screen.getByText('déconnecté')).toBeInTheDocument();

      resoudre(joueur);
      expect(await screen.findByText('chargé')).toBeInTheDocument();
    });

    it("garde l'utilisateur si /users/me répond 200", async () => {
      vi.mocked(request).mockResolvedValue(joueur);
      renderProvider();

      expect(await screen.findByText('connecté : joueur')).toBeInTheDocument();
      expect(screen.getByText('chargé')).toBeInTheDocument();
    });

    it("n'a pas d'utilisateur si /users/me répond 401", async () => {
      vi.mocked(request).mockRejectedValue(new ApiError(401, 'Unauthorized'));
      renderProvider();

      expect(await screen.findByText('chargé')).toBeInTheDocument();
      expect(screen.getByText('déconnecté')).toBeInTheDocument();
    });

    it("n'a pas d'utilisateur si le back est injoignable", async () => {
      vi.mocked(request).mockRejectedValue(new TypeError('Failed to fetch'));
      renderProvider();

      expect(await screen.findByText('chargé')).toBeInTheDocument();
      expect(screen.getByText('déconnecté')).toBeInTheDocument();
    });
  });

  describe('connect', () => {
    it('redemande GET /users/me et enregistre l\'utilisateur avec ses memberships', async () => {
      vi.mocked(request)
        .mockRejectedValueOnce(new ApiError(401, 'Unauthorized')) // démarrage : pas connecté
        .mockResolvedValueOnce(joueur); // connect() après le login
      renderProvider();
      await screen.findByText('déconnecté');

      await userEvent.click(screen.getByRole('button', { name: 'connect' }));

      expect(await screen.findByText('connecté : joueur')).toBeInTheDocument();
      expect(screen.getByText('memberships : 1')).toBeInTheDocument();
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(2, 'GET', '/users/me');
    });

    it('reste déconnecté si /users/me échoue pendant connect', async () => {
      vi.mocked(request).mockRejectedValue(new ApiError(401, 'Unauthorized'));
      renderProvider();
      await screen.findByText('chargé');

      await userEvent.click(screen.getByRole('button', { name: 'connect' }));

      await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      expect(screen.getByText('déconnecté')).toBeInTheDocument();
    });
  });

  describe('disconnect', () => {
    it("appelle POST /auth/logout et vide l'utilisateur", async () => {
      vi.mocked(request).mockResolvedValueOnce(joueur).mockResolvedValueOnce(undefined);
      renderProvider();
      await screen.findByText('connecté : joueur');

      await userEvent.click(screen.getByRole('button', { name: 'disconnect' }));

      expect(request).toHaveBeenLastCalledWith('POST', '/auth/logout');
      expect(await screen.findByText('déconnecté')).toBeInTheDocument();
    });

    it("vide l'utilisateur même si /auth/logout échoue", async () => {
      vi.mocked(request)
        .mockResolvedValueOnce(joueur)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));
      renderProvider();
      await screen.findByText('connecté : joueur');

      await userEvent.click(screen.getByRole('button', { name: 'disconnect' }));

      await waitFor(() => expect(screen.getByText('déconnecté')).toBeInTheDocument());
    });
  });
});

describe('useSession', () => {
  it('lance une erreur claire si utilisé hors du SessionProvider', () => {
    // React affiche l'erreur dans la console : on la coupe pour garder la sortie lisible.
    const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});

    expect(() => render(<Lecteur />)).toThrow(/SessionProvider/);

    console.mockRestore();
  });
});
