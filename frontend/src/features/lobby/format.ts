import type { Table } from "@transcendence/shared";
import type { EtatChaise } from "@/design-system/composites/CarteTable";
import type { TFunction } from "i18next";

const VARIANTES: Record<Table['variant'], string> = {
    TEXAS_HOLDEM: 'NLH',
    OMAHA: 'PLO',
};

const chf = (centimes: number) => String(centimes / 100);

export function toPlaces(table: Table): EtatChaise[] {
    return table.seats.map((s) => (s.status === 'FREE' ? 'libre' : 'occupee'));
}

export function details(table: Table, t: TFunction): string {
    const libres = table.seats.filter((s) => s.status === 'FREE').length;
    const dispo = libres === 0 
        ? t('lobby.complete')
        : t('lobby.placesLibres', { count: libres });
    return `${VARIANTES[table.variant]} ${chf(table.smallBlind)}/${chf(table.bigBlind)} · ${dispo}`; 
}