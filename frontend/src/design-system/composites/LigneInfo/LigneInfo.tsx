import styles from './LigneInfo.module.css';
import type { ReactNode } from 'react';

type LigneInfoProps = {
    libelle: string;
    valeur: ReactNode;
};

export function LigneInfo(props: LigneInfoProps) {
    const {libelle, valeur} = props;
    return (
        <div className={styles.ligne}>
            <dt className={`${styles.libelle} typo-texte-petit`}>{libelle}</dt>
            <dd className={`${styles.valeur} typo-libelle`}>{valeur}</dd>
        </div>
    );
};