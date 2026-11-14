import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '@/lib/i18n';
import { ApiError } from '@/lib/api';
import type { MyProfileUser, MyProfileWithMemberships } from '@transcendence/shared';
import { LoginPage } from './LoginPage';
import { login } from './api';

vi.mock('./api', () => ({ login: vi.fn() }));

// On remplace la session par un faux : le vrai SessionProvider appellerait
// /users/me au montage. `session` est modifiable test par test
// (personne connecté, déjà connecté, en chargement…).
const connect = vi.fn();
let session: { user: MyProfileWithMemberships | null; load: boolean } = { user: null, load: false };
vi.mock('@/lib/session/contexte', () => ({
  useSession: () => ({ ...session, connect, disconnect: vi.fn() }),
}));

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

function renderLogin(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Page lobby</p>} />
        <Route path="/reservations" element={<p>Page réservations</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function remplirEtEnvoyer(email: string, motDePasse: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Mot de passe'), motDePasse);
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
    connect.mockReset();
    session = { user: null, load: false };
  });

  it('affiche le titre et les champs', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });

  it("n'appelle pas le backend si les champs sont vides", async () => {
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(screen.getByText('E-mail ou mot de passe incorrect')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('redirige vers le lobby si la connexion réussit', async () => {
    vi.mocked(login).mockResolvedValue(joueur);
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'MotDePasse1!');

    expect(login).toHaveBeenCalledWith('joueur@exemple.ch', 'MotDePasse1!');
    expect(await screen.findByText('Page lobby')).toBeInTheDocument();
  });

  it('recharge la session (connect) après un login réussi', async () => {
    vi.mocked(login).mockResolvedValue(joueur);
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'MotDePasse1!');

    await screen.findByText('Page lobby');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith();
  });

  it("affiche l'erreur générique et ne redirige pas si connect échoue après le login", async () => {
    vi.mocked(login).mockResolvedValue(joueur);
    connect.mockRejectedValue(new TypeError('Failed to fetch'));
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'MotDePasse1!');

    expect(await screen.findByText('Une erreur est survenue, réessaie plus tard.')).toBeInTheDocument();
    expect(screen.queryByText('Page lobby')).not.toBeInTheDocument();
  });

  it("n'enregistre rien dans la session si le login échoue", async () => {
    vi.mocked(login).mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'mauvais');

    await screen.findByText('E-mail ou mot de passe incorrect');
    expect(connect).not.toHaveBeenCalled();
  });

  it('affiche une erreur si les identifiants sont faux (401)', async () => {
    vi.mocked(login).mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'mauvais');

    expect(await screen.findByText('E-mail ou mot de passe incorrect')).toBeInTheDocument();
  });

  it('affiche une erreur si trop de tentatives (429)', async () => {
    vi.mocked(login).mockRejectedValue(new ApiError(429, 'Too Many Requests'));
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'mauvais');

    expect(await screen.findByText('Trop de tentatives, réessaie dans une minute.')).toBeInTheDocument();
  });

  describe('retour vers la page demandée (from)', () => {
    it("après le login, renvoie vers la page que SafeRoute avait bloquée", async () => {
      vi.mocked(login).mockResolvedValue(joueur);
      renderLogin({ from: '/reservations' });

      await remplirEtEnvoyer('joueur@exemple.ch', 'MotDePasse1!');

      expect(await screen.findByText('Page réservations')).toBeInTheDocument();
      expect(screen.queryByText('Page lobby')).not.toBeInTheDocument();
    });

    it('sans from, renvoie vers le lobby', async () => {
      vi.mocked(login).mockResolvedValue(joueur);
      renderLogin();

      await remplirEtEnvoyer('joueur@exemple.ch', 'MotDePasse1!');

      expect(await screen.findByText('Page lobby')).toBeInTheDocument();
    });
  });

  describe('session déjà connue', () => {
    const joueurConnecte: MyProfileWithMemberships = { ...joueur, memberships: [] };

    it("n'affiche rien pendant le chargement de la session", () => {
      session = { user: null, load: true };
      renderLogin();

      expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
      expect(screen.queryByText('Page lobby')).not.toBeInTheDocument();
    });

    it('redirige vers le lobby si on est déjà connecté', () => {
      session = { user: joueurConnecte, load: false };
      renderLogin();

      expect(screen.getByText('Page lobby')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
    });

    it('redirige vers from si on est déjà connecté', () => {
      session = { user: joueurConnecte, load: false };
      renderLogin({ from: '/reservations' });

      expect(screen.getByText('Page réservations')).toBeInTheDocument();
    });
  });

  it("affiche « compte créé » quand on arrive depuis l'inscription", () => {
    renderLogin({ inscrit: true });

    expect(screen.getByText('Compte créé, tu peux te connecter.')).toBeInTheDocument();
  });
});
