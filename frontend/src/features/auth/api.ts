import { request } from '../../lib/api';
import type { MyProfileUser } from '@transcendence/shared';

export function login(email: string, password: string) {
    return request<MyProfileUser>('POST', '/auth/login', {email, password});
}

export type DonneeInscription = {
    prenom: string;
    nom: string;
    pseudo: string;
    email: string;
    motDePasse: string;
    dateNaissance: string;
};

export function inscription(donnees: DonneeInscription) {
    return request<MyProfileUser>('POST', '/auth/register', {
        firstName: donnees.prenom,
        lastName: donnees.nom,
        pseudo: donnees.pseudo,
        email: donnees.email,
        password: donnees.motDePasse,
        birthDate: donnees.dateNaissance,
    });
}