import type { ButtonHTMLAttributes } from "react";
import { Icone } from "../../icones";
import styles from "./OptionMenu.module.css";


type OptionMenuProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    selected?: boolean;
};

export function OptionMenu(props: OptionMenuProps) {
    const { selected = false, className, children, ...reste} = props;

    return (
        <button {...reste} type="button" className={`${styles.option} ${className ?? ''}`}>
            <span className={`${styles.libelle} typo-texte-petit`}>{children}</span>
            {selected && <Icone nom="coche" taille={16}/>}
        </button>
    );
}