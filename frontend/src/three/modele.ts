export const URL_MODELE = '/models/floor.glb';
import type { Object3D } from "three";

export function nomPlace(index: number): string {
    return `Seat_${String(index + 1).padStart(2, '0')}`;
}

export function indexDepuisNom(nom: string): number | null {
    const res = /^Seat_(\d{2})$/.exec(nom);
    return res ? Number(res[1]) - 1 : null;
}

export function trouverPlace(objet: Object3D | null): number | null {
    for (let i = objet; i; i = i.parent) {
        const index = indexDepuisNom(i.name);
        if (index !== null) return index;
    }
    return null;
}