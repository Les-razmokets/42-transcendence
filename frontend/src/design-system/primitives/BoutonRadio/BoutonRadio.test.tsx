import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoutonRadio } from './BoutonRadio';

describe('BoutonRadio', () => {
  it('est un bouton radio accessible par son label', () => {
    render(
      <label>
        Solo
        <BoutonRadio name="mode" />
      </label>,
    );

    expect(screen.getByRole('radio', { name: 'Solo' })).toBeInTheDocument();
  });

  it('est décoché par défaut', () => {
    render(<BoutonRadio name="mode" aria-label="Solo" />);

    expect(screen.getByRole('radio')).not.toBeChecked();
  });

  it('reflète la prop checked', () => {
    render(<BoutonRadio name="mode" aria-label="Solo" checked readOnly />);

    expect(screen.getByRole('radio')).toBeChecked();
  });

  it('appelle onChange au clic', async () => {
    const auChangement = vi.fn();
    render(<BoutonRadio name="mode" aria-label="Solo" onChange={auChangement} />);

    await userEvent.click(screen.getByRole('radio'));

    expect(auChangement).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio')).toBeChecked();
  });

  it("n'appelle pas onChange quand il est désactivé", async () => {
    const auChangement = vi.fn();
    render(<BoutonRadio name="mode" aria-label="Solo" onChange={auChangement} disabled />);

    await userEvent.click(screen.getByRole('radio'));

    expect(auChangement).not.toHaveBeenCalled();
    expect(screen.getByRole('radio')).toBeDisabled();
  });

  it('ajoute la className de la feature sans retirer la sienne', () => {
    render(<BoutonRadio name="mode" aria-label="Solo" className="ma-classe" />);

    const radio = screen.getByRole('radio');
    expect(radio).toHaveClass('ma-classe');
    expect(radio.className).toMatch(/radio/);
  });

  it('un seul bouton du groupe est coché à la fois', async () => {
    render(
      <>
        <BoutonRadio name="mode" value="solo" aria-label="Solo" />
        <BoutonRadio name="mode" value="duo" aria-label="Duo" />
      </>,
    );
    const solo = screen.getByRole('radio', { name: 'Solo' });
    const duo = screen.getByRole('radio', { name: 'Duo' });

    await userEvent.click(solo);
    expect(solo).toBeChecked();
    expect(duo).not.toBeChecked();

    await userEvent.click(duo);
    expect(duo).toBeChecked();
    expect(solo).not.toBeChecked();
  });
});
