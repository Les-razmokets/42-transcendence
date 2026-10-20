import type { ButtonHTMLAttributes } from "react";
import styles from "./Onglet.module.css"

type OngletProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    actif?: boolean
};

export function Onglet(props: OngletProps) {
    const { actif = false, className, ...reste } = props;
    return (
        <button
            {...reste}
            type="button"
            role="tab"
            aria-selected={actif}
            tabIndex={actif ? 0 : -1}
            className={`${styles.onglet} typo-texte-fort ${className ?? ''}`}
        />       
    )
}