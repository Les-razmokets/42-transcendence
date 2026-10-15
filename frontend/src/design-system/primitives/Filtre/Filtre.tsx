import type { ButtonHTMLAttributes } from "react";
import styles from "./Filtre.module.css";
import { Icone } from "../../icones";

type FiltreProps = ButtonHTMLAttributes & {
    actif? : boolean,
    chevron?: boolean
};

export function Filtre(props: FiltreProps) {
    const { actif = false, chevron = true, className, children, ...reste} = props;

    return (
        <button
            {...reste}
            aria-pressed={chevron ? undefined : actif}
            className={``}
        >
            {children}
            {chevron && <Icone nom="chevron-bas" taille={16}/>}
        </button>
    );
};