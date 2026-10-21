import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { LigneMenu } from './LigneMenu';
import styles from './LigneMenu.module.css';

// NavLink a besoin d'un routeur ; on choisit l'URL courante
function renderAvecRouteur(ui: ReactNode, url = '/') {
  return render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);
}

describe('LigneMenu', () => {
  describe('contenu', () => {
    it('affiche le libellé avec son style et sa typo', () => {
      renderAvecRouteur(<LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />);

      expect(screen.getByText('Mes réservations')).toHaveClass(styles.libelle);
      expect(screen.getByText('Mes réservations')).toHaveClass('typo-texte-fort');
    });

    it("affiche l'icône et le chevron par défaut", () => {
      const { container } = renderAvecRouteur(
        <LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />,
      );

      expect(container.querySelectorAll('svg')).toHaveLength(2);
      expect(container.querySelector(`.${styles.chevron}`)).toBeInTheDocument();
    });

    it('masque le chevron avec chevron={false}', () => {
      const { container } = renderAvecRouteur(
        <LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" chevron={false} />,
      );

      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector(`.${styles.chevron}`)).toBeNull();
    });

    it("rend l'icône à la bonne taille", () => {
      const { container } = renderAvecRouteur(
        <LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" chevron={false} />,
      );

      expect(container.querySelector('svg')).toHaveAttribute('width', '20');
    });

    it('cache les icônes décoratives : le nom vient du libellé seul', () => {
      const { container } = renderAvecRouteur(
        <LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />,
      );

      container.querySelectorAll('svg').forEach((svg) => {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      });
      expect(screen.getByRole('link', { name: 'Mes réservations' })).toBeInTheDocument();
    });

    it('place icône, libellé puis chevron dans cet ordre', () => {
      renderAvecRouteur(<LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />);

      const enfants = Array.from(screen.getByRole('link').children);

      expect(enfants[0].tagName.toLowerCase()).toBe('svg');
      expect(enfants[1]).toHaveTextContent('Mes réservations');
      expect(enfants[2]).toHaveClass(styles.chevron);
    });
  });

  describe('avec link : lien de navigation', () => {
    it('rend un lien vers la bonne adresse', () => {
      renderAvecRouteur(<LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />);

      expect(screen.getByRole('link', { name: 'Mes réservations' })).toHaveAttribute(
        'href',
        '/compte',
      );
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('applique le style de ligne', () => {
      renderAvecRouteur(<LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />);

      expect(screen.getByRole('link')).toHaveClass(styles.ligne);
    });

    it("est active quand l'URL correspond", () => {
      renderAvecRouteur(
        <LigneMenu libelle="Paramètres" icone="reglages" link="/compte/parametres" />,
        '/compte/parametres',
      );

      expect(screen.getByRole('link')).toHaveClass(styles.actif);
      expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
    });

    it("n'est pas active sur une autre URL", () => {
      renderAvecRouteur(
        <LigneMenu libelle="Paramètres" icone="reglages" link="/compte/parametres" />,
        '/compte/infos',
      );

      expect(screen.getByRole('link')).not.toHaveClass(styles.actif);
      expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
    });

    it("n'est pas active sur une sous-page de son adresse", () => {
      renderAvecRouteur(
        <LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />,
        '/compte/parametres',
      );

      expect(screen.getByRole('link')).not.toHaveClass(styles.actif);
    });

    it('navigue vers son adresse au clic', async () => {
      renderAvecRouteur(
        <>
          <LigneMenu libelle="Paramètres" icone="reglages" link="/compte/parametres" />
          <Routes>
            <Route path="/" element={<p>Accueil</p>} />
            <Route path="/compte/parametres" element={<p>Page paramètres</p>} />
          </Routes>
        </>,
      );

      await userEvent.click(screen.getByRole('link', { name: 'Paramètres' }));

      expect(screen.getByText('Page paramètres')).toBeInTheDocument();
      expect(screen.getByRole('link')).toHaveClass(styles.actif);
    });

    it('applique le style danger', () => {
      renderAvecRouteur(
        <LigneMenu libelle="Supprimer" icone="ticket" link="/compte/supprimer" danger />,
      );

      expect(screen.getByRole('link')).toHaveClass(styles.danger);
    });
  });

  describe('sans link : bouton', () => {
    it('rend un bouton de type button', () => {
      renderAvecRouteur(<LigneMenu libelle="Se déconnecter" icone="sortie" onClick={() => {}} />);

      expect(screen.getByRole('button', { name: 'Se déconnecter' })).toHaveAttribute(
        'type',
        'button',
      );
      expect(screen.queryByRole('link')).toBeNull();
    });

    it('applique le style de ligne, sans style actif', () => {
      renderAvecRouteur(<LigneMenu libelle="Se déconnecter" icone="sortie" onClick={() => {}} />);

      expect(screen.getByRole('button')).toHaveClass(styles.ligne);
      expect(screen.getByRole('button')).not.toHaveClass(styles.actif);
    });

    it('appelle onClick au clic', async () => {
      const auClic = vi.fn();
      renderAvecRouteur(<LigneMenu libelle="Se déconnecter" icone="sortie" onClick={auClic} />);

      await userEvent.click(screen.getByRole('button'));

      expect(auClic).toHaveBeenCalledTimes(1);
    });

    it('ne soumet pas le formulaire qui la contient', async () => {
      const auSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
      renderAvecRouteur(
        <form onSubmit={(e) => auSubmit(e.nativeEvent as SubmitEvent)}>
          <LigneMenu libelle="Se déconnecter" icone="sortie" onClick={() => {}} />
        </form>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(auSubmit).not.toHaveBeenCalled();
    });

    it("n'est pas en style danger par défaut", () => {
      renderAvecRouteur(<LigneMenu libelle="Se déconnecter" icone="sortie" onClick={() => {}} />);

      expect(screen.getByRole('button')).not.toHaveClass(styles.danger);
    });

    it('applique le style danger', () => {
      renderAvecRouteur(
        <LigneMenu libelle="Se déconnecter" icone="sortie" danger onClick={() => {}} />,
      );

      expect(screen.getByRole('button')).toHaveClass(styles.danger);
    });
  });

  it('dans un menu, seule la page courante est active', () => {
    renderAvecRouteur(
      <nav>
        <LigneMenu libelle="Mes réservations" icone="ticket" link="/compte" />
        <LigneMenu libelle="Informations personnelles" icone="profil" link="/compte/infos" />
        <LigneMenu libelle="Paramètres" icone="reglages" link="/compte/parametres" />
      </nav>,
      '/compte/parametres',
    );

    const actifs = screen
      .getAllByRole('link')
      .filter((lien) => lien.classList.contains(styles.actif));

    expect(actifs).toHaveLength(1);
    expect(actifs[0]).toHaveAccessibleName('Paramètres');
  });
});
