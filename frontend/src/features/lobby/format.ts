import type { Table } from "@transcendence/shared";
import type { EtatChaise } from "@/design-system/composites/CarteTable";
import type { TFunction } from "i18next";
import { formaterJeu, formaterPrix } from "@/lib/format";

export function toPlaces(table: Table): EtatChaise[] {
    return table.seats.map((s) => (s.status === 'FREE' ? 'libre' : 'occupee'));
}

export function details(table: Table, t: TFunction): string {
    const libres = table.seats.filter((s) => s.status === 'FREE').length;
    const dispo = libres === 0
        ? t('lobby.complete')
        : t('lobby.placesLibres', { count: libres });
    const block = [formaterJeu(table), dispo];
    if (table.moneyOnTable > 0)
        block.push(t('lobby.enJeu', { montant: formaterPrix(table.moneyOnTable) }));

    return block.join(' · ');
}
