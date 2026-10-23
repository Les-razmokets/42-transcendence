import styles from './Option.module.css';
import type { InputHTMLAttributes } from 'react';
import { BoutonRadio } from '../../primitives/BoutonRadio';

type OptionProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    libelle: string;
    description?: string;
};

export function Option(props: OptionProps) {
    const {libelle, description, className, ...reste} = props;

    return (
        <label className={`${styles.option} ${className ?? ''}`}>
            <BoutonRadio {...reste}/>
            <span className={styles.texte}>
                <span className='typo-texte-fort'>{libelle}</span>
                {description && <span className={`${styles.description} typo-legende`}>{description}</span>}
            </span>
        </label>
    );
}