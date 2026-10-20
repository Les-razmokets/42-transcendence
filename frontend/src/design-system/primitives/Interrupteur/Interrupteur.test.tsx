import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Interrupteur } from './Interrupteur';
import styles from './Interrupteur.module.css';

describe('Interrupteur', () => {
  it('est un interrupteur accessible par son label', () => {
    render(
      <label>
        Notifications
        <Interrupteur />
      </label>,
    );

    expect(
      screen.getByRole('switch', { name: 'Notifications' }),
    ).toBeInTheDocument();
  });

  it('est une case à cocher native', () => {
    render(<Interrupteur aria-label="Notifications" />);

    expect(screen.getByRole('switch')).toHaveAttribute('type', 'checkbox');
  });

  it('est éteint par défaut', () => {
    render(<Interrupteur aria-label="Notifications" />);

    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('reflète la prop checked', () => {
    render(<Interrupteur aria-label="Notifications" checked readOnly />);

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('reflète la prop defaultChecked', () => {
    render(<Interrupteur aria-label="Notifications" defaultChecked />);

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('bascule au clic', async () => {
    render(<Interrupteur aria-label="Notifications" />);

    await userEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toBeChecked();

    await userEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('appelle onChange à chaque bascule', async () => {
    const auChangement = vi.fn();
    render(<Interrupteur aria-label="Notifications" onChange={auChangement} />);

    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('switch'));

    expect(auChangement).toHaveBeenCalledTimes(2);
  });

  it('bascule au clic sur son label', async () => {
    render(
      <label>
        Notifications
        <Interrupteur />
      </label>,
    );

    await userEvent.click(screen.getByText('Notifications'));

    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('bascule au clavier avec la barre espace', async () => {
    render(<Interrupteur aria-label="Notifications" />);

    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();

    await userEvent.keyboard(' ');
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it("ne bascule pas et n'appelle pas onChange quand il est désactivé", async () => {
    const auChangement = vi.fn();
    render(
      <Interrupteur
        aria-label="Notifications"
        onChange={auChangement}
        disabled
      />,
    );

    await userEvent.click(screen.getByRole('switch'));

    expect(auChangement).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('ajoute la className de la feature sans retirer la sienne', () => {
    render(<Interrupteur aria-label="Notifications" className="ma-classe" />);

    expect(screen.getByRole('switch')).toHaveClass(
      'ma-classe',
      styles.interrupteur,
    );
  });

  it('transmet les attributs natifs au champ', () => {
    render(
      <Interrupteur aria-label="Notifications" name="notifs" value="oui" />,
    );

    expect(screen.getByRole('switch')).toHaveAttribute('name', 'notifs');
    expect(screen.getByRole('switch')).toHaveAttribute('value', 'oui');
  });
});
