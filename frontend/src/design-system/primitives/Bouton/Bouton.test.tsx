import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bouton } from './Bouton';

describe('Bouton', () => {
  it('affiche son texte', () => {
    render(<Bouton>Réserver</Bouton>);

    expect(screen.getByRole('button', { name: 'Réserver' })).toBeInTheDocument();
  });

  it('appelle onClick au clic', async () => {
    const auClic = vi.fn();
    render(<Bouton onClick={auClic}>Jouer</Bouton>);

    await userEvent.click(screen.getByRole('button', { name: 'Jouer' }));

    expect(auClic).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onClick quand il est désactivé", async () => {
    const auClic = vi.fn();
    render(
      <Bouton onClick={auClic} disabled>
        Jouer
      </Bouton>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Jouer' }));

    expect(auClic).not.toHaveBeenCalled();
  });

  it('ajoute la className de la feature sans retirer les siennes', () => {
    render(<Bouton className="ma-classe">OK</Bouton>);

    expect(screen.getByRole('button')).toHaveClass('ma-classe', 'typo-texte-fort');
  });
});
