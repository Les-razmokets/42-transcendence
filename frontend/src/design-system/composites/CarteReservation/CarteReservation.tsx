import { Bouton } from "../../primitives/Bouton";
import { QrCode } from "../../primitives/QrCode";
import styles from "./CarteReservation.module.css";

type CarteReservationProps = {
    casino: string;
    date: string;
    table: string;
    buyIn: string;
    reference: string;
    libelleQr: string;
    status: 'a-venir' | 'passee';
    libelleAfficheQr: string;
    libelleAnnuler: string;
    onAfficherQr: () => void;
    onAnnuler: () => void;
};

export function CarteReservation(props: CarteReservationProps) {
    const { casino, date, table, buyIn, reference, libelleQr, status, libelleAfficheQr, libelleAnnuler, onAfficherQr, onAnnuler} = props;

    const aVenir = status === 'a-venir';

    return (
        <article className={`${styles.carte} ${aVenir ? '' : styles.passee}`}>
            <div className={styles.contenu}>
                <div className={styles.qr}>
                    <QrCode valeur={reference} libelle={libelleQr} taille={72}/>
                </div>

                <div className={styles.info}>
                    <span className="typo-titre-3">{casino}</span>
                    <span className="typo-texte-petit">{date}</span>
                    <span className={`${styles.secondaire} typo-legende`}>{table}</span>
                    <span className="typo-libelle">{buyIn}</span>
                </div>
            </div>

            {aVenir && (
                <div className={styles.action}>
                    <Bouton onClick={onAfficherQr}>{libelleAfficheQr}</Bouton>
                    <Bouton variante="secondaire" onClick={onAnnuler}>{libelleAnnuler}</Bouton>
                </div>
            )}
        </article>
    );
}