import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Option } from './Option';
import styles from './Option.module.css';

describe('Option', () => {
  it('est un bouton radio accessible par son libellé', () => {
    render(<Option name="langue" libelle="Français" />);

    expect(screen.getByRole('radio', { name: 'Français' })).toBeInTheDocument();
  });

  it('affiche le libellé avec sa typo', () => {
    render(<Option name="langue" libelle="Français" />);

    expect(screen.getByText('Français')).toHaveClass('typo-texte-fort');
  });

  it("n'affiche pas de description quand elle est absente", () => {
    const { container } = render(<Option name="langue" libelle="Français" />);

    expect(container.querySelector(`.${styles.description}`)).toBeNull();
  });

  it('affiche la description avec son style et sa typo', () => {
    render(<Option name="langue" libelle="Français" description="Langue actuelle" />);

    expect(screen.getByText('Langue actuelle')).toHaveClass(styles.description);
    expect(screen.getByText('Langue actuelle')).toHaveClass('typo-legende');
  });

  it('enveloppe le radio et le texte dans un <label>', () => {
    render(<Option name="langue" libelle="Français" />);

    const label = screen.getByText('Français').closest('label');

    expect(label).toHaveClass(styles.option);
    expect(label).toContainElement(screen.getByRole('radio'));
  });

  it('applique className sur le <label> et non sur le radio', () => {
    render(<Option name="langue" libelle="Français" className="perso" />);

    expect(screen.getByText('Français').closest('label')).toHaveClass('perso');
    expect(screen.getByText('Français').closest('label')).toHaveClass(styles.option);
    expect(screen.getByRole('radio')).not.toHaveClass('perso');
  });

  it('transmet les autres props au radio', () => {
    render(<Option name="langue" value="fr" id="option-fr" libelle="Français" />);

    const radio = screen.getByRole('radio');

    expect(radio).toHaveAttribute('name', 'langue');
    expect(radio).toHaveAttribute('value', 'fr');
    expect(radio).toHaveAttribute('id', 'option-fr');
  });

  it('est décochée par défaut', () => {
    render(<Option name="langue" libelle="Français" />);

    expect(screen.getByRole('radio')).not.toBeChecked();
  });

  it('respecte defaultChecked', () => {
    render(<Option name="langue" libelle="Français" defaultChecked />);

    expect(screen.getByRole('radio')).toBeChecked();
  });

  it('reflète la prop checked', () => {
    render(<Option name="langue" libelle="Français" checked readOnly />);

    expect(screen.getByRole('radio')).toBeChecked();
  });

  it('se coche au clic sur le libellé', async () => {
    const auChangement = vi.fn();
    render(<Option name="langue" libelle="Français" onChange={auChangement} />);

    await userEvent.click(screen.getByText('Français'));

    expect(auChangement).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio')).toBeChecked();
  });

  it('se coche au clic sur la description', async () => {
    render(<Option name="langue" libelle="Français" description="Langue actuelle" />);

    await userEvent.click(screen.getByText('Langue actuelle'));

    expect(screen.getByRole('radio')).toBeChecked();
  });

  it("ne se coche pas et n'appelle pas onChange quand elle est désactivée", async () => {
    const auChangement = vi.fn();
    render(<Option name="langue" libelle="Français" disabled onChange={auChangement} />);

    await userEvent.click(screen.getByText('Français'));

    expect(auChangement).not.toHaveBeenCalled();
    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByRole('radio')).toBeDisabled();
  });

  it("ne garde qu'une seule option cochée dans un même groupe", async () => {
    render(
      <div role="radiogroup" aria-label="Langue">
        <Option name="langue" value="fr" libelle="Français" defaultChecked />
        <Option name="langue" value="de" libelle="Deutsch" />
      </div>,
    );

    await userEvent.click(screen.getByText('Deutsch'));

    expect(screen.getByRole('radio', { name: 'Deutsch' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Français' })).not.toBeChecked();
  });

  it('se navigue au clavier avec les flèches dans un groupe', async () => {
    render(
      <div role="radiogroup" aria-label="Langue">
        <Option name="langue" value="fr" libelle="Français" defaultChecked />
        <Option name="langue" value="de" libelle="Deutsch" />
      </div>,
    );

    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Français' })).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toBeChecked();
  });
});
