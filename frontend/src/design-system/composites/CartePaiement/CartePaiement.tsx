import type { ButtonHTMLAttributes } from "react";
import { Badge } from "../../primitives/Badge";
import { Icone } from "../../icones";
import styles from "./CartePaiement.module.css";

type CartePaiementProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    brand: string;
    title: string;
    detail: string;
    byDefault?: boolean;
    libelleDefault?: string;
};

export function CartePaiement(props: CartePaiementProps) {
    const { brand, title, detail, byDefault = false, libelleDefault, className, ...reste} = props;

    return (
        <button
            {...reste}
            type="button"
            className={`${styles.carte} ${byDefault ? styles.byDefault : ''} ${className ?? ''}`}
        >
            <span className={`${styles.brand} typo-legende-forte`}>{brand}</span>
            <span className={styles.textes}>
                <span className="typo-texte-fort">{title}</span>
                <span className={`${styles.detail} typo-legende`}>{detail}</span>
            </span>

            {byDefault && libelleDefault && <Badge variante="info">{libelleDefault}</Badge>}

            <span className={styles.chevron}>
                <Icone nom="chevron-droit" taille={16} />
            </span>
        </button>
    )
}