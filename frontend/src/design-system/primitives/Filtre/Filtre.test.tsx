import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Filtre } from './Filtre';
import { icones } from '../../icones/icones.data';

describe('Filtre', () => {
  it('affiche son texte', () => {
    render(<Filtre>Casino</Filtre>);

    expect(screen.getByRole('button', { name: 'Casino' })).toBeInTheDocument();
  });

  it('appelle onClick au clic', async () => {
    const auClic = vi.fn();
    render(<Filtre onClick={auClic}>Casino</Filtre>);

    await userEvent.click(screen.getByRole('button', { name: 'Casino' }));

    expect(auClic).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onClick quand il est désactivé", async () => {
    const auClic = vi.fn();
    render(
      <Filtre onClick={auClic} disabled>
        Casino
      </Filtre>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Casino' }));

    expect(auClic).not.toHaveBeenCalled();
  });

  it('ajoute la className de la feature sans retirer les siennes', () => {
    render(<Filtre className="ma-classe">Casino</Filtre>);

    expect(screen.getByRole('button')).toHaveClass('ma-classe', 'typo-libelle');
  });

  it("applique la classe d'état actif uniquement quand actif est vrai", () => {
    const { rerender } = render(<Filtre>Casino</Filtre>);
    expect(screen.getByRole('button').className).not.toMatch(/actif/);

    rerender(<Filtre actif>Casino</Filtre>);
    expect(screen.getByRole('button').className).toMatch(/actif/);
  });

  describe('avec chevron (par défaut)', () => {
    it('est un déclencheur de menu fermé', () => {
      render(<Filtre>Casino</Filtre>);
      const bouton = screen.getByRole('button');

      expect(bouton).toHaveAttribute('aria-haspopup', 'menu');
      expect(bouton).toHaveAttribute('aria-expanded', 'false');
    });

    it("n'expose pas aria-pressed", () => {
      render(<Filtre actif>Casino</Filtre>);

      expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
    });

    it('affiche le chevron vers le bas quand fermé', () => {
      const { container } = render(<Filtre>Casino</Filtre>);

      expect(container.querySelector('path')).toHaveAttribute('d', icones['chevron-bas']);
    });

    it('affiche le chevron vers le haut et aria-expanded quand ouvert', () => {
      const { container } = render(<Filtre ouvert>Casino</Filtre>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
      expect(container.querySelector('path')).toHaveAttribute('d', icones['chevron-haut']);
    });
  });

  describe('sans chevron', () => {
    it("n'affiche aucune icône", () => {
      const { container } = render(<Filtre chevron={false}>Casino</Filtre>);

      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    it('se comporte comme un bouton à bascule (aria-pressed)', () => {
      const { rerender } = render(<Filtre chevron={false}>Casino</Filtre>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

      rerender(
        <Filtre chevron={false} actif>
          Casino
        </Filtre>,
      );
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it("n'expose ni aria-haspopup ni aria-expanded", () => {
      render(<Filtre chevron={false}>Casino</Filtre>);
      const bouton = screen.getByRole('button');

      expect(bouton).not.toHaveAttribute('aria-haspopup');
      expect(bouton).not.toHaveAttribute('aria-expanded');
    });
  });
});
