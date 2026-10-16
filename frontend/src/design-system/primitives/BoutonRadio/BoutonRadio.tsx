import styles from "./BoutonRadio.module.css"
import type { InputHTMLAttributes } from "react";

type BoutonRadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function BoutonRadio(props: BoutonRadioProps) {
    const { className, ...reste } = props;
    return <input type="radio" {...reste} className={`${styles.radio} ${className ?? ''}`}/>
}