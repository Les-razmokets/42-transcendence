import type { ButtonHTMLAttributes } from "react";
import styles from "./Filtre.module.css";
import { Icone } from "../../icones";

type FiltreProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    actif? : boolean,
    chevron?: boolean,
    ouvert?: boolean
};

export function Filtre(props: FiltreProps) {
    const { actif = false, chevron = true, ouvert = false, className, children, ...reste} = props;

    return (
        <button
            {...reste}
            aria-pressed={chevron ? undefined : actif}
            aria-haspopup={chevron ? 'menu' : undefined}
            aria-expanded={chevron ? ouvert : undefined}
            className={`${styles.filtre} ${actif ? styles.actif : ''} typo-libelle ${className ?? ''}`}
        >
            {children}
            {chevron && <Icone nom={ouvert ? "chevron-haut" : "chevron-bas"} taille={16}/>}
        </button>
    );
};