import { describe, it, expect } from 'vitest';
import type { Table } from '@transcendence/shared';
import i18n from '@/lib/i18n';
import { tables } from '@/lib/mocks/lobby';
import { details, toPlaces } from './format';

const t = i18n.t;

// Part d'une table du mock et remplace seulement ce qui intéresse le test
function table(modifs: Partial<Table> = {}): Table {
  return { ...tables[0], ...modifs };
}

// Intl (fr-CH) met une espace insécable entre le montant et « CHF »
const NBSP = ' ';

describe('toPlaces', () => {
  it('traduit FREE en libre et OCCUPIED en occupee, dans l’ordre des sièges', () => {
    const places = toPlaces(table());

    expect(places).toEqual([
      'occupee', 'libre', 'occupee', 'occupee', 'libre',
      'occupee', 'occupee', 'libre', 'occupee',
    ]);
  });

  it('renvoie une liste vide si la table n’a pas de sièges', () => {
    expect(toPlaces(table({ seats: [] }))).toEqual([]);
  });
});

describe('details', () => {
  it('affiche variante, blinds en CHF, places libres et argent en jeu', () => {
    // table-1 : NLH 100/200 centimes, 3 libres, 450 000 centimes en jeu
    expect(details(table(), t)).toBe(`NLH 1/2 · 3 libres · 4'500${NBSP}CHF en jeu`);
  });

  it('affiche PLO pour une table Omaha', () => {
    expect(details(table({ variant: 'OMAHA' }), t)).toMatch(/^PLO /);
  });

  it('convertit les blinds de centimes en francs (y compris les décimales)', () => {
    expect(details(table({ smallBlind: 50, bigBlind: 100 }), t)).toMatch(/^NLH 0\.5\/1 · /);
  });

  it('met « libre » au singulier quand il reste une seule place', () => {
    const unSeulLibre = table({
      seats: tables[0].seats.map((s) => ({ ...s, status: s.seatNumber === 2 ? 'FREE' : 'OCCUPIED' })),
    });

    expect(details(unSeulLibre, t)).toContain(' · 1 libre · ');
  });

  it('affiche « Complète » quand toutes les places sont prises', () => {
    // table-2 : pleine, 2/5, 12 000 CHF en jeu
    expect(details(tables[1], t)).toBe(`NLH 2/5 · Complète · 12'000${NBSP}CHF en jeu`);
  });

  it('n’affiche pas l’argent en jeu quand il vaut 0 (pas de « · » en trop)', () => {
    expect(details(table({ moneyOnTable: 0 }), t)).toBe('NLH 1/2 · 3 libres');
  });
});
