import { icones, type NomIcone } from "./icones.data";

type IconProps = {
    nom: NomIcone,
    taille?: 16 | 20 | 24,
    libelle?: string,
};

export function Icone({nom, taille = 24, libelle } : IconProps) {
    return (
        <svg
        width={taille}
        height={taille}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={libelle ? 'img' : undefined}
        aria-label={libelle}
        aria-hidden={libelle ? undefined : true}
        >
            <path d={icones[nom]}/>
        </svg>
    )
}



