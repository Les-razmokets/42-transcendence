import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { CarteReservation } from './CarteReservation';
import styles from './CarteReservation.module.css';
import boutonStyles from '../../primitives/Bouton/Bouton.module.css';

type Props = ComponentProps<typeof CarteReservation>;

// Props complètes ; chaque test ne surcharge que ce qui l'intéresse
function renderCarte(surcharge: Partial<Props> = {}) {
  const props: Props = {
    casino: 'Casino de Montreux',
    date: 'Ven. 16 oct. · 20:00',
    table: 'Table 4 · Place 5 · NLH 1/2',
    buyIn: 'Buy-in payé : 200 CHF',
    reference: 'FLR-1610-0042',
    libelleQr: 'QR code de la réservation FLR-1610-0042',
    status: 'a-venir',
    libelleAfficheQr: 'Afficher le QR',
    libelleAnnuler: 'Annuler',
    onAfficherQr: () => {},
    onAnnuler: () => {},
    ...surcharge,
  };
  return render(<CarteReservation {...props} />);
}

describe('CarteReservation', () => {
  describe('contenu', () => {
    it('rend un article avec le style de carte', () => {
      renderCarte();

      expect(screen.getByRole('article')).toHaveClass(styles.carte);
    });

    it('affiche le casino en titre 3', () => {
      renderCarte();

      expect(screen.getByText('Casino de Montreux')).toHaveClass('typo-titre-3');
    });

    it('affiche la date en texte petit', () => {
      renderCarte();

      expect(screen.getByText('Ven. 16 oct. · 20:00')).toHaveClass('typo-texte-petit');
    });

    it('affiche la table en style secondaire', () => {
      renderCarte();

      expect(screen.getByText('Table 4 · Place 5 · NLH 1/2')).toHaveClass(styles.secondaire);
      expect(screen.getByText('Table 4 · Place 5 · NLH 1/2')).toHaveClass('typo-legende');
    });

    it('affiche le buy-in en libellé', () => {
      renderCarte();

      expect(screen.getByText('Buy-in payé : 200 CHF')).toHaveClass('typo-libelle');
    });

    it('place casino, date, table puis buy-in dans cet ordre', () => {
      renderCarte();

      const info = screen.getByText('Casino de Montreux').parentElement!;

      expect(info).toHaveClass(styles.info);
      expect(Array.from(info.children).map((el) => el.textContent)).toEqual([
        'Casino de Montreux',
        'Ven. 16 oct. · 20:00',
        'Table 4 · Place 5 · NLH 1/2',
        'Buy-in payé : 200 CHF',
      ]);
    });

    it("n'affiche pas la référence en texte", () => {
      renderCarte();

      expect(screen.queryByText('FLR-1610-0042')).toBeNull();
    });
  });

  describe('QR code', () => {
    it('affiche le QR code avec son libellé accessible', () => {
      renderCarte();

      expect(
        screen.getByRole('img', { name: 'QR code de la réservation FLR-1610-0042' }),
      ).toBeInTheDocument();
    });

    it('rend le QR code à 72px', () => {
      renderCarte();

      const svg = screen.getByRole('img').querySelector('svg');

      expect(svg).toHaveAttribute('width', '72');
      expect(svg).toHaveAttribute('height', '72');
    });

    it('encode la référence : une autre référence donne un autre QR', () => {
      const { container: a } = renderCarte({ reference: 'FLR-1610-0042' });
      const { container: b } = renderCarte({ reference: 'FLR-2210-0099' });

      expect(a.querySelector('svg')!.innerHTML).not.toBe(b.querySelector('svg')!.innerHTML);
    });

    it('place le QR avant les infos', () => {
      renderCarte();

      const contenu = screen.getByRole('article').querySelector(`.${styles.contenu}`)!;

      expect(contenu.children[0]).toHaveClass(styles.qr);
      expect(contenu.children[0]).toContainElement(screen.getByRole('img'));
      expect(contenu.children[1]).toHaveClass(styles.info);
    });

    it('reste affiché pour une réservation passée', () => {
      renderCarte({ status: 'passee' });

      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  describe('réservation à venir', () => {
    it("n'a pas le style passée", () => {
      renderCarte();

      expect(screen.getByRole('article')).not.toHaveClass(styles.passee);
    });

    it("n'écrit pas « undefined » dans les classes", () => {
      renderCarte();

      expect(screen.getByRole('article').className).not.toContain('undefined');
    });

    it('affiche les deux boutons dans la zone action', () => {
      renderCarte();

      const action = screen.getByRole('article').querySelector(`.${styles.action}`) as HTMLElement;

      expect(action).toBeInTheDocument();
      expect(within(action).getAllByRole('button')).toHaveLength(2);
    });

    it('affiche « Afficher le QR » en bouton principal, en premier', () => {
      renderCarte();

      const boutons = screen.getAllByRole('button');

      expect(boutons[0]).toHaveAccessibleName('Afficher le QR');
      expect(boutons[0]).toHaveClass(boutonStyles.principal);
    });

    it('affiche « Annuler » en bouton secondaire, en second', () => {
      renderCarte();

      const boutons = screen.getAllByRole('button');

      expect(boutons[1]).toHaveAccessibleName('Annuler');
      expect(boutons[1]).toHaveClass(boutonStyles.secondaire);
    });

    it('appelle onAfficherQr au clic, et seulement lui', async () => {
      const auAfficher = vi.fn();
      const auAnnuler = vi.fn();
      renderCarte({ onAfficherQr: auAfficher, onAnnuler: auAnnuler });

      await userEvent.click(screen.getByRole('button', { name: 'Afficher le QR' }));

      expect(auAfficher).toHaveBeenCalledTimes(1);
      expect(auAnnuler).not.toHaveBeenCalled();
    });

    it('appelle onAnnuler au clic, et seulement lui', async () => {
      const auAfficher = vi.fn();
      const auAnnuler = vi.fn();
      renderCarte({ onAfficherQr: auAfficher, onAnnuler: auAnnuler });

      await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

      expect(auAnnuler).toHaveBeenCalledTimes(1);
      expect(auAfficher).not.toHaveBeenCalled();
    });
  });

  describe('réservation passée', () => {
    it('applique le style passée en plus du style de carte', () => {
      renderCarte({ status: 'passee' });

      expect(screen.getByRole('article')).toHaveClass(styles.carte);
      expect(screen.getByRole('article')).toHaveClass(styles.passee);
    });

    it("n'affiche aucun bouton ni zone action", () => {
      renderCarte({ status: 'passee' });

      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.getByRole('article').querySelector(`.${styles.action}`)).toBeNull();
    });

    it('garde toutes les infos de la réservation', () => {
      renderCarte({ status: 'passee' });

      expect(screen.getByText('Casino de Montreux')).toBeInTheDocument();
      expect(screen.getByText('Ven. 16 oct. · 20:00')).toBeInTheDocument();
      expect(screen.getByText('Table 4 · Place 5 · NLH 1/2')).toBeInTheDocument();
      expect(screen.getByText('Buy-in payé : 200 CHF')).toBeInTheDocument();
    });
  });

  it('dans une liste, seules les réservations à venir ont des boutons', () => {
    render(
      <div>
        <CarteReservation
          casino="Casino de Montreux" date="Ven. 16 oct." table="Table 4" buyIn="200 CHF"
          reference="A" libelleQr="QR A" status="a-venir"
          libelleAfficheQr="Afficher le QR" libelleAnnuler="Annuler"
          onAfficherQr={() => {}} onAnnuler={() => {}}
        />
        <CarteReservation
          casino="Casino de Genève" date="Sam. 3 oct." table="Table 2" buyIn="100 CHF"
          reference="B" libelleQr="QR B" status="passee"
          libelleAfficheQr="Afficher le QR" libelleAnnuler="Annuler"
          onAfficherQr={() => {}} onAnnuler={() => {}}
        />
      </div>,
    );

    const [aVenir, passee] = screen.getAllByRole('article');

    expect(within(aVenir).getAllByRole('button')).toHaveLength(2);
    expect(within(passee).queryAllByRole('button')).toHaveLength(0);
  });
});
