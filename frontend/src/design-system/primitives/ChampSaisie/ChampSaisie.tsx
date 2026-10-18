import { useId, type InputHTMLAttributes } from "react";
import styles from "./ChampSaisie.module.css"

type ChampSaisieProps = InputHTMLAttributes<HTMLInputElement> & {
    libelle: string;
    aide?: string;
    erreur?: string;
};

export function ChampSaisie (props: ChampSaisieProps) {
    const { libelle, aide, erreur, id, className, ...reste} = props;

    const idAuto = useId();
    const idChamp = id ?? idAuto;
    const idMessage = `${idChamp}-message`;
    const message = erreur ?? aide;

    return (
        <div className={`${styles.champ} ${className ?? ''}`}>
            <label htmlFor={idChamp} className="typo-libelle">
                {libelle}
            </label>
            <input
                {...reste}
                id={idChamp}
                aria-invalid={erreur ? true : undefined}
                aria-describedby={message ? idMessage : undefined}
                className={`${styles.saisie} typo-texte-base`}
            />
            {message && (
                <p id={idMessage} className={`${erreur ? styles.erreur : styles.aide} typo-legende`}>
                    {message}
                </p>
            )}
        </div>
    );
}