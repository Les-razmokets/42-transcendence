import styles from "./Avatar.module.css"

type AvatarProps = {
    nom: string;
    taille?: 'm' | 'l';
};

const classesTypo = {
    m: 'typo-libelle-fort',
    l: 'typo-titre-3',
} as const;

function initialeNom(nom: string) : string {
    return nom
        .trim()
        .split(/\s+/)
        .slice(0,2)
        .map((m) => m[0])
        .join('')
        .toUpperCase()
}

export function Avatar(props: AvatarProps) {
    const { nom, taille = 'm'} = props;
    return (
        <span className={`${styles.avatar} ${styles[taille]} ${classesTypo[taille]}`} aria-hidden="true">
            {initialeNom(nom)}
        </span>
    );
}