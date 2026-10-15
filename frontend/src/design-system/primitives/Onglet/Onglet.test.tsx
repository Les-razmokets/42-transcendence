import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onglet } from './Onglet';

describe('Onglet', () => {
  it('est un onglet (role tab) qui affiche son texte', () => {
    render(<Onglet>À venir</Onglet>);

    expect(screen.getByRole('tab', { name: 'À venir' })).toBeInTheDocument();
  });

  it('est de type button pour ne pas soumettre un formulaire', () => {
    render(<Onglet>À venir</Onglet>);

    expect(screen.getByRole('tab')).toHaveAttribute('type', 'button');
  });

  it('est inactif par défaut', () => {
    render(<Onglet>À venir</Onglet>);
    const onglet = screen.getByRole('tab');

    expect(onglet).toHaveAttribute('aria-selected', 'false');
    expect(onglet).toHaveAttribute('tabindex', '-1');
  });

  it('est sélectionné et atteignable au clavier quand il est actif', () => {
    render(<Onglet actif>À venir</Onglet>);
    const onglet = screen.getByRole('tab');

    expect(onglet).toHaveAttribute('aria-selected', 'true');
    expect(onglet).toHaveAttribute('tabindex', '0');
  });

  it('appelle onClick au clic', async () => {
    const auClic = vi.fn();
    render(<Onglet onClick={auClic}>Passée</Onglet>);

    await userEvent.click(screen.getByRole('tab', { name: 'Passée' }));

    expect(auClic).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onClick quand il est désactivé", async () => {
    const auClic = vi.fn();
    render(
      <Onglet onClick={auClic} disabled>
        Passée
      </Onglet>,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Passée' }));

    expect(auClic).not.toHaveBeenCalled();
  });

  it('ajoute la className de la feature sans retirer les siennes', () => {
    render(<Onglet className="ma-classe">À venir</Onglet>);

    expect(screen.getByRole('tab')).toHaveClass('ma-classe', 'typo-texte-fort');
  });

  it('dans un groupe, un seul onglet est dans l’ordre de tabulation', () => {
    render(
      <div role="tablist" aria-label="Réservations">
        <Onglet actif>À venir</Onglet>
        <Onglet>Passée</Onglet>
      </div>,
    );

    const [aVenir, passee] = screen.getAllByRole('tab');
    expect(aVenir).toHaveAttribute('aria-selected', 'true');
    expect(aVenir).toHaveAttribute('tabindex', '0');
    expect(passee).toHaveAttribute('aria-selected', 'false');
    expect(passee).toHaveAttribute('tabindex', '-1');
  });
});
