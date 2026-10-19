import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from './Slider';
import styles from './Slider.module.css';

const propsParDefaut = {
  valeur: 200,
  min: 100,
  max: 300,
  step: 10,
  onChange: () => {},
  libelle: 'Montant du buy-in',
  texteValeur: '200 CHF',
  texteMin: 'Min 100 CHF',
  texteMax: 'Max 300 CHF',
};

describe('Slider', () => {
  it('est un curseur accessible par son libellé', () => {
    render(<Slider {...propsParDefaut} />);

    expect(
      screen.getByRole('slider', { name: 'Montant du buy-in' }),
    ).toBeInTheDocument();
  });

  it('est un champ de type range avec le style de la piste', () => {
    render(<Slider {...propsParDefaut} />);

    expect(screen.getByRole('slider')).toHaveAttribute('type', 'range');
    expect(screen.getByRole('slider')).toHaveClass(styles.piste);
  });

  it('transmet min, max, step et valeur au champ', () => {
    render(<Slider {...propsParDefaut} />);

    const curseur = screen.getByRole('slider');
    expect(curseur).toHaveAttribute('min', '100');
    expect(curseur).toHaveAttribute('max', '300');
    expect(curseur).toHaveAttribute('step', '10');
    expect(curseur).toHaveValue('200');
  });

  it('reflète la prop valeur', () => {
    render(<Slider {...propsParDefaut} valeur={250} texteValeur="250 CHF" />);

    expect(screen.getByRole('slider')).toHaveValue('250');
  });

  it('expose le texte de la valeur aux lecteurs d’écran', () => {
    render(<Slider {...propsParDefaut} />);

    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      '200 CHF',
    );
  });

  it('met à jour le texte de la valeur quand il change', () => {
    const { rerender } = render(<Slider {...propsParDefaut} />);

    rerender(<Slider {...propsParDefaut} valeur={250} texteValeur="250 CHF" />);

    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      '250 CHF',
    );
  });

  describe('bornes', () => {
    it('affiche les textes min et max', () => {
      render(<Slider {...propsParDefaut} />);

      expect(screen.getByText('Min 100 CHF')).toBeInTheDocument();
      expect(screen.getByText('Max 300 CHF')).toBeInTheDocument();
    });

    it('cache les bornes aux lecteurs d’écran', () => {
      render(<Slider {...propsParDefaut} />);

      expect(screen.getByText('Min 100 CHF').parentElement).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    it('applique le style des bornes et la typo', () => {
      render(<Slider {...propsParDefaut} />);

      expect(screen.getByText('Min 100 CHF').parentElement).toHaveClass(
        styles.borne,
        'typo-legende',
      );
    });
  });

  describe('onChange', () => {
    it('est appelé avec la nouvelle valeur sous forme de nombre', () => {
      const auChangement = vi.fn();
      render(<Slider {...propsParDefaut} onChange={auChangement} />);

      fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } });

      expect(auChangement).toHaveBeenCalledTimes(1);
      expect(auChangement).toHaveBeenCalledWith(250);
    });

    it("n'est pas appelé tant que rien ne change", () => {
      const auChangement = vi.fn();
      render(<Slider {...propsParDefaut} onChange={auChangement} />);

      expect(auChangement).not.toHaveBeenCalled();
    });
  });

  describe('progression (--pourcentage)', () => {
    const pourcentage = () =>
      screen.getByRole('slider').style.getPropertyValue('--pourcentage');

    it.each([
      [100, '0%'],
      [200, '50%'],
      [250, '75%'],
      [300, '100%'],
    ])('vaut la bonne part pour la valeur %i', (valeur, attendu) => {
      render(<Slider {...propsParDefaut} valeur={valeur} />);

      expect(pourcentage()).toBe(attendu);
    });

    it('tient compte du min quand il est différent de 0', () => {
      render(<Slider {...propsParDefaut} min={0} max={100} valeur={25} />);

      expect(pourcentage()).toBe('25%');
    });
  });
});
