import { BoutonIcone } from "../../primitives/BoutonIcone";
import { EnTeteBase } from "./EnTeteBase";
import styles from "./EnTete.module.css";

type EnTeteTableProps = {
    userName: string;
    libelleAccount: string;
    titre: string;
    details: string;
    libelleReturn: string;
    onRetour: () => void;
};

export function EnTeteTable(props: EnTeteTableProps) {
    const { titre, details, libelleReturn, onRetour, ...reste } = props;

    return (
        <EnTeteBase
            {...reste}
            left={<BoutonIcone icone="fleche-gauche" libelle={libelleReturn} onClick={onRetour}/>}
            center={
                <div className={styles.infos}>
                    <span className={styles.titre}>{titre}</span>
                    <span className={`${styles.details} typo-legende`}>{details}</span>
                </div>
            }
        />
    );
}