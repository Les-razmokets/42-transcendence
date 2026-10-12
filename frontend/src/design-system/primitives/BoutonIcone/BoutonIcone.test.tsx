import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoutonIcone } from './BoutonIcone';
import styles from './BoutonIcone.module.css';

describe('BoutonIcone', () => {
  it('est annoncé avec son libellé', () => {
    render(<BoutonIcone icone="plus" libelle="Ajouter" />);

    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });

  it("cache l'icône aux lecteurs d'écran", () => {
    render(<BoutonIcone icone="plus" libelle="Ajouter" />);

    const svg = screen.getByRole('button').querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('affiche une icône de 20 px', () => {
    render(<BoutonIcone icone="plus" libelle="Ajouter" />);

    expect(screen.getByRole('button').querySelector('svg')).toHaveAttribute('width', '20');
  });

  it('appelle onClick au clic', async () => {
    const auClic = vi.fn();
    render(<BoutonIcone icone="plus" libelle="Ajouter" onClick={auClic} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(auClic).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onClick quand il est désactivé", async () => {
    const auClic = vi.fn();
    render(<BoutonIcone icone="plus" libelle="Ajouter" onClick={auClic} disabled />);

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(auClic).not.toHaveBeenCalled();
  });

  it('ajoute la className de la feature sans retirer la sienne', () => {
    render(<BoutonIcone icone="plus" libelle="Ajouter" className="ma-classe" />);

    expect(screen.getByRole('button')).toHaveClass('ma-classe', styles.boutonIcone);
  });
});
