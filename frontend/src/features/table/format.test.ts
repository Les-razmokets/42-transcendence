import { describe, expect, it } from 'vitest';
import type { Table } from '@transcendence/shared';
import { placesTable } from './format';

const seat = (seatNumber: number, status: 'FREE' | 'OCCUPIED') => ({ id: `s${seatNumber}`, seatNumber, status });

const table = (seats: Table['seats']): Table => ({
    id: 't1', casinoId: 'c1', name: 'Table 1', smallBlind: 100, bigBlind: 200,
    maxSeats: seats.length, status: 'OPEN', moneyOnTable: 0, seats, variant: 'TEXAS_HOLDEM',
});

describe('placesTable', () => {
    it('place chaque siège selon son seatNumber, pas selon sa position dans la liste', () => {
        const places = placesTable(table([seat(3, 'FREE'), seat(1, 'OCCUPIED')]), null);
        expect(places[0]).toBe('occupee');
        expect(places[2]).toBe('libre');
    });

    it('affiche comme occupées les places qui n’existent pas (Omaha : 8 sièges)', () => {
        const huit = Array.from({ length: 8 }, (_, i) => seat(i + 1, 'FREE'));
        const places = placesTable(table(huit), null);
        expect(places).toHaveLength(9);
        expect(places[8]).toBe('occupee');
    });

    it('marque la place choisie si elle est libre', () => {
        expect(placesTable(table([seat(5, 'FREE')]), 4)[4]).toBe('selection');
    });

    it('ignore un choix sur une place occupée', () => {
        expect(placesTable(table([seat(5, 'OCCUPIED')]), 4)[4]).toBe('occupee');
    });
});
