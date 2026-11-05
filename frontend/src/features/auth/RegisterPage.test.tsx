import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '@/lib/i18n';
import { ApiError } from '@/lib/api';
import { RegisterPage } from './RegisterPage';
import { inscription } from './api';

// on remplace l'appel au backend par une fausse fonction
vi.mock('./api', () => ({ inscription: vi.fn() }));

// on rend la page sur "/register" et une page factice sur "/login" pour vérifier la redirection
function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<p>Page connexion</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function remplir(motDePasse = 'MotDePasse1!', dateNaissance = '2000-01-01') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Prénom'), 'Dusan');
  await user.type(screen.getByLabelText('Nom'), 'Fama');
  await user.type(screen.getByLabelText('Pseudo'), 'dusan');
  await user.type(screen.getByLabelText('E-mail'), 'dusan@exemple.ch');
  await user.type(screen.getByLabelText('Mot de passe'), motDePasse);
  // userEvent.type gère mal les <input type="date"> dans jsdom : on change la valeur directement
  fireEvent.change(screen.getByLabelText('Date de naissance'), { target: { value: dateNaissance } });
}

function envoyer() {
  return userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(inscription).mockReset();
  });

  it("affiche les erreurs et n'appelle pas le backend si le formulaire est vide", async () => {
    renderRegister();

    await envoyer();

    // prénom, nom et date de naissance
    expect(screen.getAllByText('Ce champ est obligatoire')).toHaveLength(3);
    expect(screen.getByText('Pseudo invalide')).toBeInTheDocument();
    expect(screen.getByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(screen.getByText('Mot de passe trop faible')).toBeInTheDocument();
    expect(inscription).not.toHaveBeenCalled();
  });

  it('refuse un mot de passe sans symbole', async () => {
    renderRegister();

    await remplir('MotDePasse1');
    await envoyer();

    expect(screen.getByText('Mot de passe trop faible')).toBeInTheDocument();
    expect(inscription).not.toHaveBeenCalled();
  });

  it('refuse une personne de moins de 18 ans', async () => {
    renderRegister();

    const annee = new Date().getFullYear() - 10;
    await remplir('MotDePasse1!', `${annee}-01-01`);
    await envoyer();

    expect(screen.getByText('Tu dois avoir au moins 18 ans.')).toBeInTheDocument();
    expect(inscription).not.toHaveBeenCalled();
  });

  it('envoie les données et redirige vers /login si tout est valide', async () => {
    vi.mocked(inscription).mockResolvedValue({} as Awaited<ReturnType<typeof inscription>>);
    renderRegister();

    await remplir();
    await envoyer();

    expect(inscription).toHaveBeenCalledWith({
      prenom: 'Dusan',
      nom: 'Fama',
      pseudo: 'dusan',
      email: 'dusan@exemple.ch',
      motDePasse: 'MotDePasse1!',
      dateNaissance: '2000-01-01',
    });
    expect(await screen.findByText('Page connexion')).toBeInTheDocument();
  });

  it('affiche une erreur sous le pseudo si il est déjà utilisé (409)', async () => {
    vi.mocked(inscription).mockRejectedValue(new ApiError(409, 'Pseudo already in use.'));
    renderRegister();

    await remplir();
    await envoyer();

    expect(await screen.findByText('Ce pseudo est déjà utilisé')).toBeInTheDocument();
  });
});
