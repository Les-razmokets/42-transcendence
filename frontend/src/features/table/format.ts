import type { Table } from "@transcendence/shared";
import type { EtatChaise } from "@/three";

export const NOMBRE_PLACES = 9;

export function placesTable(table: Table, choisie: number | null): EtatChaise[] {
    //par défaut occupé
    const places = Array<EtatChaise>(NOMBRE_PLACES).fill('occupee');

    for (const seat of table.seats) {
        const index = seat.seatNumber - 1;
        if (index >= 0 && index < NOMBRE_PLACES && seat.status === 'FREE')
            places[index] = 'libre';
    }
    if (choisie !== null && places[choisie] === 'libre')
        places[choisie] = 'selection';

    return places;
}