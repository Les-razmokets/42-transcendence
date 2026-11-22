import type { Table } from '@transcendence/shared';


const VARIANTES: Record<Table['variant'], string> = {
    TEXAS_HOLDEM: 'NLH',
    OMAHA: 'PLO',
};

const prixCHF = new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 0,
});

export function formaterBlinde(centimes: number): string {
    return String(centimes / 100);
}

export function formaterPrix(centimes: number): string {
    return prixCHF.format(centimes / 100);
}

export function formaterJeu(table: Table): string {
    return `${VARIANTES[table.variant]} ${formaterBlinde(table.smallBlind)}/${formaterBlinde(table.bigBlind)}`;
}
