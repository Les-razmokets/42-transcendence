import { describe, expect, it } from 'vitest';
import { hauteurPourCadrer } from './cadrage';

const emprise = { largeur: 4, profondeur: 2.7, sommet: 0.94 };

describe('hauteurPourCadrer', () => {
  it('recule la caméra sur un écran très large (la profondeur limite)', () => {
    const large = hauteurPourCadrer(emprise, 30, 21 / 9, 1);
    const demiV = Math.tan((30 * Math.PI) / 360);
    expect((large - emprise.sommet) * demiV * 2).toBeCloseTo(emprise.profondeur);
  });

  it('recule la caméra sur un écran étroit (la largeur limite)', () => {
    const etroit = hauteurPourCadrer(emprise, 65, 0.5, 1);
    const demiH = Math.tan((65 * Math.PI) / 360) * 0.5;
    expect((etroit - emprise.sommet) * demiH * 2).toBeCloseTo(emprise.largeur);
  });

  it('applique la marge', () => {
    const sans = hauteurPourCadrer(emprise, 40, 16 / 9, 1) - emprise.sommet;
    const avec = hauteurPourCadrer(emprise, 40, 16 / 9, 1.1) - emprise.sommet;
    expect(avec).toBeCloseTo(sans * 1.1);
  });
});
