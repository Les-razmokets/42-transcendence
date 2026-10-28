import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartePaiement } from './CartePaiement';
import styles from './CartePaiement.module.css';
import badgeStyles from '../../primitives/Badge/Badge.module.css';

const props = {
  brand: 'VISA',
  title: 'Visa •••• 4242',
  detail: 'Expire 08/28',
};

describe('CartePaiement', () => {
  describe('contenu', () => {
    it('affiche la marque avec son style et sa typo', () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByText('VISA')).toHaveClass(styles.brand);
      expect(screen.getByText('VISA')).toHaveClass('typo-legende-forte');
    });

    it('affiche le titre en typo forte', () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByText('Visa •••• 4242')).toHaveClass('typo-texte-fort');
    });

    it('affiche le détail avec son style et sa typo', () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByText('Expire 08/28')).toHaveClass(styles.detail);
      expect(screen.getByText('Expire 08/28')).toHaveClass('typo-legende');
    });

    it('regroupe titre et détail dans le bloc de textes', () => {
      render(<CartePaiement {...props} />);

      const textes = screen.getByText('Visa •••• 4242').parentElement;

      expect(textes).toHaveClass(styles.textes);
      expect(textes).toContainElement(screen.getByText('Expire 08/28'));
    });

    it('affiche un chevron de 16px', () => {
      const { container } = render(<CartePaiement {...props} />);

      const chevron = container.querySelector(`.${styles.chevron}`);

      expect(chevron).toBeInTheDocument();
      expect(chevron?.querySelector('svg')).toHaveAttribute('width', '16');
    });

    it('place marque, textes puis chevron dans cet ordre', () => {
      render(<CartePaiement {...props} />);

      const enfants = Array.from(screen.getByRole('button').children);

      expect(enfants).toHaveLength(3);
      expect(enfants[0]).toHaveClass(styles.brand);
      expect(enfants[1]).toHaveClass(styles.textes);
      expect(enfants[2]).toHaveClass(styles.chevron);
    });

    it('a un nom accessible qui contient le titre', () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByRole('button')).toHaveAccessibleName(/Visa •••• 4242/);
    });
  });

  describe('bouton', () => {
    it('rend un bouton de type button', () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('applique le style de carte', () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByRole('button')).toHaveClass(styles.carte);
    });

    it('appelle onClick au clic', async () => {
      const auClic = vi.fn();
      render(<CartePaiement {...props} onClick={auClic} />);

      await userEvent.click(screen.getByRole('button'));

      expect(auClic).toHaveBeenCalledTimes(1);
    });

    it('ne soumet pas le formulaire qui la contient', async () => {
      const auSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
      render(
        <form onSubmit={(e) => auSubmit(e.nativeEvent as SubmitEvent)}>
          <CartePaiement {...props} />
        </form>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(auSubmit).not.toHaveBeenCalled();
    });

    it('garde type="button" même si on passe type="submit"', () => {
      render(<CartePaiement {...props} type="submit" />);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('transmet les attributs HTML au bouton', () => {
      render(<CartePaiement {...props} aria-label="Choisir Visa" data-testid="carte" />);

      expect(screen.getByRole('button', { name: 'Choisir Visa' })).toHaveAttribute(
        'data-testid',
        'carte',
      );
    });

    it('ajoute la className reçue sans écraser le style de carte', () => {
      render(<CartePaiement {...props} className="perso" />);

      expect(screen.getByRole('button')).toHaveClass(styles.carte);
      expect(screen.getByRole('button')).toHaveClass('perso');
    });

    it("n'écrit pas « undefined » dans les classes sans className", () => {
      render(<CartePaiement {...props} />);

      expect(screen.getByRole('button').className).not.toContain('undefined');
    });

    it("n'appelle pas onClick quand il est désactivé", async () => {
      const auClic = vi.fn();
      render(<CartePaiement {...props} disabled onClick={auClic} />);

      await userEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('button')).toBeDisabled();
      expect(auClic).not.toHaveBeenCalled();
    });
  });

  describe('carte par défaut', () => {
    it("n'a pas le style par défaut sans byDefault", () => {
      render(<CartePaiement {...props} libelleDefault="Par défaut" />);

      expect(screen.getByRole('button')).not.toHaveClass(styles.byDefault);
    });

    it("n'affiche pas le badge sans byDefault, même avec un libellé", () => {
      render(<CartePaiement {...props} libelleDefault="Par défaut" />);

      expect(screen.queryByText('Par défaut')).toBeNull();
    });

    it('applique le style par défaut avec byDefault', () => {
      render(<CartePaiement {...props} byDefault libelleDefault="Par défaut" />);

      expect(screen.getByRole('button')).toHaveClass(styles.byDefault);
    });

    it('affiche le badge info avec byDefault et un libellé', () => {
      render(<CartePaiement {...props} byDefault libelleDefault="Par défaut" />);

      expect(screen.getByText('Par défaut')).toHaveClass(badgeStyles.badge);
      expect(screen.getByText('Par défaut')).toHaveClass(badgeStyles.info);
    });

    it('place le badge entre les textes et le chevron', () => {
      render(<CartePaiement {...props} byDefault libelleDefault="Par défaut" />);

      const enfants = Array.from(screen.getByRole('button').children);

      expect(enfants).toHaveLength(4);
      expect(enfants[1]).toHaveClass(styles.textes);
      expect(enfants[2]).toHaveTextContent('Par défaut');
      expect(enfants[3]).toHaveClass(styles.chevron);
    });

    it("garde le style par défaut mais pas de badge avec byDefault sans libellé", () => {
      render(<CartePaiement {...props} byDefault />);

      expect(screen.getByRole('button')).toHaveClass(styles.byDefault);
      expect(screen.getByRole('button').children).toHaveLength(3);
    });

    it("n'affiche pas de badge avec un libellé vide", () => {
      render(<CartePaiement {...props} byDefault libelleDefault="" />);

      expect(screen.getByRole('button').children).toHaveLength(3);
    });
  });

  it('dans une liste, seule la carte par défaut porte le badge', () => {
    render(
      <div>
        <CartePaiement brand="VISA" title="Visa •••• 4242" detail="Expire 08/28" byDefault libelleDefault="Par défaut" />
        <CartePaiement brand="MC" title="Mastercard •••• 8817" detail="Expire 11/27" libelleDefault="Par défaut" />
        <CartePaiement brand="TWINT" title="TWINT" detail="+41 79 ••• •• 42" />
      </div>,
    );

    const parDefaut = screen
      .getAllByRole('button')
      .filter((carte) => carte.classList.contains(styles.byDefault));

    expect(screen.getAllByText('Par défaut')).toHaveLength(1);
    expect(parDefaut).toHaveLength(1);
    expect(parDefaut[0]).toHaveTextContent('Visa •••• 4242');
  });
});
