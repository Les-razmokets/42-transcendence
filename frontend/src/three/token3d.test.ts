import { describe, expect, it } from 'vitest';
import { nomPlace } from './modele';

describe('nomPlace', () => {
  it('donne le nom Blender de la place', () => {
    expect(nomPlace(0)).toBe('Seat_01');
    expect(nomPlace(8)).toBe('Seat_09');
  });
});
