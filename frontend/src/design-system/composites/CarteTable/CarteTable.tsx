import { Link } from "react-router";
import { VueTable } from "./VueTable";
import type { EtatChaise } from "./Chaise";
import styles from './CarteTable.module.css';

type CarteTableProps = {
    casino: string;
    details: string;
    places: EtatChaise[];
    link: string;
};

export function CarteTable(props: CarteTableProps) {
    const { casino, details, places, link} = props;
    const complete = places.every((p) => p === 'occupee');

    const contenu = (
        <>
            <div className={styles.cadreTable}>
                <VueTable places={places}/>
            </div>
            <span className="typo-titre-3">{casino}</span>
            <span className={`${styles.details} typo-texte-petit`}>{details}</span>
        </>
    );

    if (complete) {
        return <div className={`${styles.carte} ${styles.complete}`}>{contenu}</div>;
    }

    return (
        <Link to={link} className={styles.carte}>
            {contenu}
        </Link>
    );
}