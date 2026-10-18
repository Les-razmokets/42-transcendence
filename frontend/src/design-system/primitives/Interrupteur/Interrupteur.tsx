import type { InputHTMLAttributes } from "react";
import styles from './Interrupteur.module.css'

type InterrupteurProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function Interrupteur(props: InterrupteurProps) {
    const { className, ...reste} = props;
    return (
        <input
            {...reste}
            type="checkbox"
            role="switch"
            className={`${styles.interrupteur} ${className ?? ''}`}   
        />
    );
}