import styles from './LigneReglage.module.css';
import type { InputHTMLAttributes } from 'react';
import { Interrupteur } from '../../primitives/Interrupteur';

type LigneReglageProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    libelle: string;
    description?: string;
};

export function LigneReglage(props: LigneReglageProps) {
    const {libelle, description, className, ...reste} = props;

    return (
        <label className={`${styles.ligne} ${className ?? ''}`}>
            <span className={styles.texte}>
                <span className="typo-texte-fort">{libelle}</span>
                {description && <span className={`${styles.description} typo-legende`}>{description}</span>}
            </span>
            <Interrupteur {...reste}/>
        </label>
    );
};