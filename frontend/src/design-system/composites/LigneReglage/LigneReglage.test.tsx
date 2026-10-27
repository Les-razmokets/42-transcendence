import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LigneReglage } from './LigneReglage';
import styles from './LigneReglage.module.css';

describe('LigneReglage', () => {
  it('est un interrupteur accessible par son libellé', () => {
    render(<LigneReglage libelle="Rappel avant la partie" />);

    expect(
      screen.getByRole('switch', { name: 'Rappel avant la partie' }),
    ).toBeInTheDocument();
  });

  it('affiche le libellé avec sa typo', () => {
    render(<LigneReglage libelle="Rappel avant la partie" />);

    expect(screen.getByText('Rappel avant la partie')).toHaveClass('typo-texte-fort');
  });

  it("n'affiche pas de description quand elle est absente", () => {
    const { container } = render(<LigneReglage libelle="Rappel avant la partie" />);

    expect(container.querySelector(`.${styles.description}`)).toBeNull();
  });

  it('affiche la description avec son style et sa typo', () => {
    render(
      <LigneReglage
        libelle="Rappel avant la partie"
        description="Une notification 2 h avant ta réservation."
      />,
    );

    const description = screen.getByText('Une notification 2 h avant ta réservation.');

    expect(description).toHaveClass(styles.description);
    expect(description).toHaveClass('typo-legende');
  });

  it("enveloppe le texte et l'interrupteur dans un <label>", () => {
    render(<LigneReglage libelle="Rappel avant la partie" />);

    const label = screen.getByText('Rappel avant la partie').closest('label');

    expect(label).toHaveClass(styles.ligne);
    expect(label).toContainElement(screen.getByRole('switch'));
  });

  it("place le texte avant l'interrupteur", () => {
    render(<LigneReglage libelle="Rappel avant la partie" />);

    const texte = screen.getByText('Rappel avant la partie');
    const interrupteur = screen.getByRole('switch');

    expect(
      texte.compareDocumentPosition(interrupteur) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("applique className sur le <label> et non sur l'interrupteur", () => {
    render(<LigneReglage libelle="Rappel avant la partie" className="perso" />);

    const label = screen.getByText('Rappel avant la partie').closest('label');

    expect(label).toHaveClass('perso');
    expect(label).toHaveClass(styles.ligne);
    expect(screen.getByRole('switch')).not.toHaveClass('perso');
  });

  it("transmet les autres props à l'interrupteur", () => {
    render(
      <LigneReglage
        libelle="Rappel avant la partie"
        name="rappel"
        value="oui"
        id="reglage-rappel"
      />,
    );

    const interrupteur = screen.getByRole('switch');

    expect(interrupteur).toHaveAttribute('name', 'rappel');
    expect(interrupteur).toHaveAttribute('value', 'oui');
    expect(interrupteur).toHaveAttribute('id', 'reglage-rappel');
  });

  it('est désactivée par défaut', () => {
    render(<LigneReglage libelle="Rappel avant la partie" />);

    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('respecte defaultChecked', () => {
    render(<LigneReglage libelle="Rappel avant la partie" defaultChecked />);

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('reflète la prop checked', () => {
    render(<LigneReglage libelle="Rappel avant la partie" checked readOnly />);

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('bascule au clic sur le libellé, dans les deux sens', async () => {
    const auChangement = vi.fn();
    render(<LigneReglage libelle="Rappel avant la partie" onChange={auChangement} />);

    await userEvent.click(screen.getByText('Rappel avant la partie'));
    expect(screen.getByRole('switch')).toBeChecked();

    await userEvent.click(screen.getByText('Rappel avant la partie'));
    expect(screen.getByRole('switch')).not.toBeChecked();

    expect(auChangement).toHaveBeenCalledTimes(2);
  });

  it('bascule au clic sur la description', async () => {
    render(
      <LigneReglage
        libelle="Rappel avant la partie"
        description="Une notification 2 h avant ta réservation."
      />,
    );

    await userEvent.click(screen.getByText('Une notification 2 h avant ta réservation.'));

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('bascule avec la touche Espace', async () => {
    render(<LigneReglage libelle="Rappel avant la partie" />);

    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();

    await userEvent.keyboard(' ');
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it("ne bascule pas et n'appelle pas onChange quand elle est indisponible", async () => {
    const auChangement = vi.fn();
    render(
      <LigneReglage
        libelle="Rappel avant la partie"
        defaultChecked
        disabled
        onChange={auChangement}
      />,
    );

    await userEvent.click(screen.getByText('Rappel avant la partie'));

    expect(auChangement).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('garde des lignes indépendantes les unes des autres', async () => {
    render(
      <>
        <LigneReglage libelle="Rappel avant la partie" />
        <LigneReglage libelle="Place libérée" />
      </>,
    );

    await userEvent.click(screen.getByText('Rappel avant la partie'));
    await userEvent.click(screen.getByText('Place libérée'));

    expect(screen.getByRole('switch', { name: 'Rappel avant la partie' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Place libérée' })).toBeChecked();
  });
});
