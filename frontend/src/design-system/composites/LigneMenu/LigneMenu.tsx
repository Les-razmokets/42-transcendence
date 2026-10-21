import styles from './LigneMenu.module.css';
import { NavLink } from 'react-router';
import type { ReactNode } from 'react';
import { Icone , type NomIcone } from '../../icones';

type LigneMenuProps = {
    libelle: string;
    icone: NomIcone;
    link?: string;
    onClick?: () => void;
    danger?: boolean;
    chevron?: boolean;
};

export function LigneMenu(props: LigneMenuProps) {
    const {libelle, icone, link, onClick, danger = false, chevron = true} = props;

    const contenu: ReactNode = (
        <>
        <Icone nom={icone} taille={20}/>
        <span className={`${styles.libelle} typo-texte-fort`}>{libelle}</span>
        {chevron && (<span className={styles.chevron}>
            <Icone nom='chevron-droit' taille={16}/>
        </span>
        )}
        </>
    );

    const classes = `${styles.ligne} ${danger ? styles.danger : ''}`;

    if (link) {
        return (
            <NavLink to={link} end className={({ isActive }) => `${classes} ${isActive ? styles.actif : ''}`}>
                {contenu}
            </NavLink>
        )
    }
    return (
        <button type='button' onClick={onClick} className={classes}>
            {contenu}
        </button>
    )
}