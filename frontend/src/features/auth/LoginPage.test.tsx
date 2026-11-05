import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '@/lib/i18n';
import { ApiError } from '@/lib/api';
import { LoginPage } from './LoginPage';
import { login } from './api';

// on remplace l'appel au backend par une fausse fonction
vi.mock('./api', () => ({ login: vi.fn() }));

// <Link> et useNavigate ont besoin d'un routeur : on rend la page sur "/login"
// et une page factice sur "/" pour vérifier la redirection
function renderLogin(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Page lobby</p>} />
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
    vi.mocked(login).mockResolvedValue({} as Awaited<ReturnType<typeof login>>);
    renderLogin();

    await remplirEtEnvoyer('joueur@exemple.ch', 'MotDePasse1!');

    expect(login).toHaveBeenCalledWith('joueur@exemple.ch', 'MotDePasse1!');
    expect(await screen.findByText('Page lobby')).toBeInTheDocument();
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

  it("affiche « compte créé » quand on arrive depuis l'inscription", () => {
    renderLogin({ inscrit: true });

    expect(screen.getByText('Compte créé, tu peux te connecter.')).toBeInTheDocument();
  });
});
