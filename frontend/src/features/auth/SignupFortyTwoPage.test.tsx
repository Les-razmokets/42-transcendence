import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '@/lib/i18n';
import { ApiError } from '@/lib/api';
import type { MyProfileUser, MyProfileWithMemberships } from '@transcendence/shared';
import { SignupFortyTwoPage } from './SignupFortyTwoPage';
import { completerInscription42 } from './api';

vi.mock('./api', () => ({ completerInscription42: vi.fn() }));

const connect = vi.fn();
let session: { user: MyProfileWithMemberships | null; load: boolean } = { user: null, load: false };
vi.mock('@/lib/session/contexte', () => ({
  useSession: () => ({ ...session, connect, disconnect: vi.fn() }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/signup/42']}>
      <Routes>
        <Route path="/signup/42" element={<SignupFortyTwoPage />} />
        <Route path="/" element={<p>Page lobby</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function choisirDate(date: string) {
  fireEvent.change(screen.getByLabelText('Date de naissance'), { target: { value: date } });
}

function envoyer() {
  return userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

describe('SignupFortyTwoPage', () => {
  beforeEach(() => {
    vi.mocked(completerInscription42).mockReset();
    connect.mockReset();
    session = { user: null, load: false };
  });

  it("refuse une date vide sans appeler le backend", async () => {
    renderPage();

    await envoyer();

    expect(screen.getByText('Ce champ est obligatoire')).toBeInTheDocument();
    expect(completerInscription42).not.toHaveBeenCalled();
  });

  it('refuse une personne de moins de 18 ans', async () => {
    renderPage();

    choisirDate(`${new Date().getFullYear() - 10}-01-01`);
    await envoyer();

    expect(screen.getByText('Tu dois avoir au moins 18 ans.')).toBeInTheDocument();
    expect(completerInscription42).not.toHaveBeenCalled();
  });

  it('crée le compte, recharge la session et va au lobby', async () => {
    vi.mocked(completerInscription42).mockResolvedValue({} as MyProfileUser);
    renderPage();

    choisirDate('2000-01-01');
    await envoyer();

    expect(completerInscription42).toHaveBeenCalledWith('2000-01-01');
    expect(connect).toHaveBeenCalled();
    expect(await screen.findByText('Page lobby')).toBeInTheDocument();
  });

  it('affiche une erreur sous le champ si le backend refuse la date (400)', async () => {
    vi.mocked(completerInscription42).mockRejectedValue(new ApiError(400, 'birthDate: invalid'));
    renderPage();

    choisirDate('2000-01-01');
    await envoyer();

    expect(await screen.findByText('Date de naissance invalide')).toBeInTheDocument();
  });

  it('propose de recommencer avec 42 si le lien a expiré (401)', async () => {
    vi.mocked(completerInscription42).mockRejectedValue(new ApiError(401, 'Unauthorized'));
    renderPage();

    choisirDate('2000-01-01');
    await envoyer();

    expect(await screen.findByText('Ta connexion avec 42 a expiré. Recommence pour continuer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recommencer avec 42' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer mon compte' })).not.toBeInTheDocument();
  });

  it('affiche un message générique si le compte existe déjà (409)', async () => {
    vi.mocked(completerInscription42).mockRejectedValue(new ApiError(409, 'Conflict'));
    renderPage();

    choisirDate('2000-01-01');
    await envoyer();

    expect(await screen.findByText(/Impossible de créer le compte/)).toBeInTheDocument();
  });

  it('redirige vers le lobby si on est déjà connecté', () => {
    session = { user: {} as MyProfileWithMemberships, load: false };
    renderPage();

    expect(screen.getByText('Page lobby')).toBeInTheDocument();
  });
});
