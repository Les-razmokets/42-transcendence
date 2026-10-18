import type { ReactNode } from "react";
import styles from "./Notification.module.css";
import { Icone } from "../../icones";

type NotificationProps = {
    variante?: 'succes' | 'erreur';
    children: ReactNode;
};

export function Notification(props: NotificationProps) {
    const { variante = 'succes', children } = props;
    const erreur = variante === 'erreur';

    return (
        <div
            role={erreur ? 'alert' : 'status'}
            className={`${styles.notification} ${styles[variante]} typo-texte-fort`}
        >
        <Icone nom={erreur ? 'info' : 'coche'} taille={20}/>
        <span>{children}</span>
        </div>
    )
}
