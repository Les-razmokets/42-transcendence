import { describe, expect, it } from 'vitest';
import type { Table } from '@transcendence/shared';
import { tables } from '@/lib/mocks/lobby';
import { formaterBlinde, formaterJeu, formaterPrix } from './format';

// Intl (fr-CH) met une espace insécable entre le montant et « CHF »
const NBSP = ' ';

// Part d'une table du mock (NLH, blindes 100/200 centimes) et remplace seulement ce qui intéresse le test
function table(modifs: Partial<Table> = {}): Table {
  return { ...tables[0], ...modifs };
}

describe('formaterBlinde', () => {
  it('convertit les centimes en francs, sans unité', () => {
    expect(formaterBlinde(200)).toBe('2');
    expect(formaterBlinde(1000)).toBe('10');
  });

  it('garde les décimales quand la blinde n’est pas un franc entier', () => {
    expect(formaterBlinde(50)).toBe('0.5');
    expect(formaterBlinde(25)).toBe('0.25');
  });
});

describe('formaterPrix', () => {
  it('affiche des francs suisses à partir de centimes', () => {
    expect(formaterPrix(20000)).toBe(`200${NBSP}CHF`);
  });

  it('sépare les milliers avec une apostrophe (usage suisse)', () => {
    expect(formaterPrix(450000)).toBe(`4'500${NBSP}CHF`);
  });

  it('n’affiche pas de centimes', () => {
    expect(formaterPrix(19999)).toBe(`200${NBSP}CHF`);
  });

  it('affiche 0 CHF pour un montant nul', () => {
    expect(formaterPrix(0)).toBe(`0${NBSP}CHF`);
  });
});

describe('formaterJeu', () => {
  it('affiche la variante et les blindes en francs', () => {
    expect(formaterJeu(table())).toBe('NLH 1/2');
  });

  it('affiche PLO pour une table Omaha', () => {
    expect(formaterJeu(table({ variant: 'OMAHA' }))).toBe('PLO 1/2');
  });

  it('convertit les blindes avec décimales', () => {
    expect(formaterJeu(table({ smallBlind: 50, bigBlind: 100 }))).toBe('NLH 0.5/1');
  });
});
