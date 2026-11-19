import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@/lib/i18n';
import { casino, tables } from '@/lib/mocks/lobby';
import { LobbyPage } from './LobbyPage';
import { getCasinos, getTables } from './api';

// On remplace les appels réseau : chaque test choisit ce que « renvoie le back »
vi.mock('./api', () => ({ getTables: vi.fn(), getCasinos: vi.fn() }));

// <CarteTable> contient des <Link> : il faut un routeur
function renderLobby() {
  return render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getTables).mockReset();
  vi.mocked(getCasinos).mockReset();
});

describe('LobbyPage', () => {
  it('n’affiche rien pendant le chargement', () => {
    // Promesses qui ne se résolvent jamais : on reste en chargement
    vi.mocked(getTables).mockReturnValue(new Promise(() => {}));
    vi.mocked(getCasinos).mockReturnValue(new Promise(() => {}));

    const { container } = renderLobby();

    expect(container).toBeEmptyDOMElement();
  });

  it('affiche une carte par table ouverte, avec le nom du casino et les détails', async () => {
    vi.mocked(getTables).mockResolvedValue(tables);
    vi.mocked(getCasinos).mockResolvedValue([casino]);

    renderLobby();

    // Le mock contient 4 tables dont 1 PAUSED : il doit en rester 3
    const cartes = await screen.findAllByRole('listitem');
    expect(cartes).toHaveLength(3);
    expect(getTables).toHaveBeenCalledWith(casino.id);
    expect(screen.getAllByText('Casino du lac')).toHaveLength(3);
    expect(within(cartes[0]).getByText("NLH 1/2 · 3 libres · 4'500 CHF en jeu")).toBeInTheDocument();
  });

  it('cache les tables en pause (status PAUSED)', async () => {
    vi.mocked(getTables).mockResolvedValue(tables);
    vi.mocked(getCasinos).mockResolvedValue([casino]);

    renderLobby();

    await screen.findAllByRole('listitem');
    // table-3 (PAUSED) est la seule à 1/2 avec 9 places libres
    expect(screen.queryByText(/9 libres/)).toBeNull();
  });

  it('les cartes des tables avec des places libres mènent à /tables/:id', async () => {
    vi.mocked(getTables).mockResolvedValue(tables);
    vi.mocked(getCasinos).mockResolvedValue([casino]);

    renderLobby();

    const liens = await screen.findAllByRole('link');
    expect(liens.map((l) => l.getAttribute('href'))).toEqual(['/tables/table-1', '/tables/table-4']);
  });

  it('une table complète n’est pas cliquable', async () => {
    vi.mocked(getTables).mockResolvedValue(tables);
    vi.mocked(getCasinos).mockResolvedValue([casino]);

    renderLobby();

    const complete = await screen.findByText(/Complète/);
    expect(complete.closest('a')).toBeNull();
  });

  it('affiche un message si aucune table n’est ouverte', async () => {
    vi.mocked(getTables).mockResolvedValue([tables[2]]); // seulement la table PAUSED
    vi.mocked(getCasinos).mockResolvedValue([casino]);

    renderLobby();

    expect(await screen.findByText('Aucune table ouverte pour le moment.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('affiche une erreur si le chargement échoue', async () => {
    vi.mocked(getTables).mockRejectedValue(new Error('réseau'));
    vi.mocked(getCasinos).mockResolvedValue([casino]);

    renderLobby();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les tables, réessaie plus tard.',
    );
    expect(screen.queryByRole('list')).toBeNull();
  });
});
