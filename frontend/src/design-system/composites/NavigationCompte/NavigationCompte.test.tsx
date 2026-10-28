import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ComponentProps } from 'react';
import { NavigationCompte } from './NavigationCompte';
import styles from './NavigationCompte.module.css';
import stylesLigne from '../LigneMenu/LigneMenu.module.css';

type Props = ComponentProps<typeof NavigationCompte>;

const liens: Props['liens'] = [
  { libelle: 'Mes réservations', icone: 'ticket', link: '/compte' },
  { libelle: 'Informations personnelles', icone: 'profil', link: '/compte/infos' },
  { libelle: 'Moyens de paiement', icone: 'carte', link: '/compte/paiement' },
  { libelle: 'Paramètres', icone: 'reglages', link: '/compte/parametres' },
];

function propsDeBase(surcharge: Partial<Props> = {}): Props {
  return {
    nom: 'Dusan Fama',
    email: 'dusan@floor.ch',
    points: '1 240',
    libellePoints: 'Points fidélité',
    liens,
    libelleDeconnexion: 'Se déconnecter',
    onDeconnexion: () => {},
    ...surcharge,
  };
}

function AdresseCourante() {
  return <p data-testid="adresse">{useLocation().pathname}</p>;
}

function renderAvecRouteur(props: Props = propsDeBase(), url = '/compte') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <NavigationCompte {...props} />
              <AdresseCourante />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NavigationCompte', () => {
  describe('structure', () => {
    it('est un landmark <nav>', () => {
      renderAvecRouteur();

      expect(screen.getByRole('navigation')).toHaveClass(styles.navigation);
    });

    it('ordonne les blocs : profil, points, menu', () => {
      renderAvecRouteur();

      const blocs = Array.from(screen.getByRole('navigation').children);

      expect(blocs).toHaveLength(3);
      expect(blocs[0]).toHaveClass(styles.profil);
      expect(blocs[1]).toHaveClass(styles.points);
      expect(blocs[2]).toHaveClass(styles.menu);
    });
  });

  describe('profil', () => {
    it('affiche le nom et l’email avec leurs typos', () => {
      renderAvecRouteur();

      expect(screen.getByText('Dusan Fama')).toHaveClass('typo-titre-3');
      expect(screen.getByText('dusan@floor.ch')).toHaveClass(styles.secondaire);
      expect(screen.getByText('dusan@floor.ch')).toHaveClass('typo-texte-petit');
    });

    it('affiche l’avatar en grand avec les initiales, caché aux lecteurs d’écran', () => {
      renderAvecRouteur();

      const avatar = screen.getByText('DF');

      expect(avatar).toHaveClass('typo-titre-3');
      expect(avatar).toHaveAttribute('aria-hidden', 'true');
    });

    it('regroupe nom et email dans le bloc identité', () => {
      renderAvecRouteur();

      const identite = screen.getByText('Dusan Fama').parentElement!;

      expect(identite).toHaveClass(styles.identite);
      expect(within(identite).getByText('dusan@floor.ch')).toBeInTheDocument();
    });
  });

  describe('points', () => {
    it('affiche le libellé puis la valeur, avec leurs typos', () => {
      renderAvecRouteur();

      const libelle = screen.getByText('Points fidélité');
      const valeur = screen.getByText('1 240');

      expect(libelle).toHaveClass(styles.secondaire);
      expect(libelle).toHaveClass('typo-surtitre');
      expect(valeur).toHaveClass('typo-affiche-titre');
      expect(libelle.parentElement).toHaveClass(styles.points);
      expect(libelle.nextElementSibling).toBe(valeur);
    });
  });

  describe('menu', () => {
    it('affiche un lien par entrée, dans l’ordre, avec le bon href', () => {
      renderAvecRouteur();

      const liensRendus = screen.getAllByRole('link');

      expect(liensRendus).toHaveLength(liens.length);
      liens.forEach((lien, i) => {
        expect(liensRendus[i]).toHaveAccessibleName(lien.libelle);
        expect(liensRendus[i]).toHaveAttribute('href', lien.link);
      });
    });

    it('n’affiche que la déconnexion quand la liste est vide', () => {
      renderAvecRouteur(propsDeBase({ liens: [] }));

      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
    });

    it('place la déconnexion en dernier dans le menu', () => {
      renderAvecRouteur();

      const menu = screen.getByRole('navigation').querySelector(`.${styles.menu}`)!;

      expect(menu.lastElementChild).toBe(screen.getByRole('button', { name: 'Se déconnecter' }));
    });

    it('navigue vers la page du lien au clic', async () => {
      const user = userEvent.setup();
      renderAvecRouteur();

      await user.click(screen.getByRole('link', { name: 'Moyens de paiement' }));

      expect(screen.getByTestId('adresse')).toHaveTextContent('/compte/paiement');
    });
  });

  describe('lien actif', () => {
    it.each(liens)('marque « $libelle » actif sur $link, et lui seul', ({ libelle, link }) => {
      renderAvecRouteur(propsDeBase(), link);

      screen.getAllByRole('link').forEach((lien) => {
        if (lien.textContent === libelle) {
          expect(lien).toHaveAttribute('aria-current', 'page');
          expect(lien).toHaveClass(stylesLigne.actif);
        } else {
          expect(lien).not.toHaveAttribute('aria-current');
          expect(lien).not.toHaveClass(stylesLigne.actif);
        }
      });
    });

    it('ne marque aucun lien actif sur une adresse hors menu', () => {
      renderAvecRouteur(propsDeBase(), '/ailleurs');

      screen.getAllByRole('link').forEach((lien) => {
        expect(lien).not.toHaveAttribute('aria-current');
      });
    });
  });

  describe('déconnexion', () => {
    it('est un bouton en style danger, sans chevron', () => {
      renderAvecRouteur();

      const bouton = screen.getByRole('button', { name: 'Se déconnecter' });

      expect(bouton).toHaveClass(stylesLigne.danger);
      expect(bouton.querySelector(`.${stylesLigne.chevron}`)).toBeNull();
      expect(bouton.querySelectorAll('svg')).toHaveLength(1);
    });

    it('appelle onDeconnexion une fois au clic, sans naviguer', async () => {
      const user = userEvent.setup();
      const onDeconnexion = vi.fn();
      renderAvecRouteur(propsDeBase({ onDeconnexion }));

      await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));

      expect(onDeconnexion).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('adresse')).toHaveTextContent('/compte');
    });

    it('appelle onDeconnexion au clavier (Entrée et Espace)', async () => {
      const user = userEvent.setup();
      const onDeconnexion = vi.fn();
      renderAvecRouteur(propsDeBase({ onDeconnexion }));

      screen.getByRole('button', { name: 'Se déconnecter' }).focus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      expect(onDeconnexion).toHaveBeenCalledTimes(2);
    });
  });
});
