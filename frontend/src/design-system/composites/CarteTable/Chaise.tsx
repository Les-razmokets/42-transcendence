import chaiseLibre from '@/assets/table/chaise_creme.png';
import chaiseOccupee from '@/assets/table/chaise_occupee.png';
import styles from './CarteTable.module.css';

export type EtatChaise = 'libre' | 'occupee';

type ChaiseProps = {
    etat: EtatChaise;
};

export function Chaise(props: ChaiseProps) {
    const { etat} = props;
    return (
        <img
            src={etat === 'libre' ? chaiseLibre : chaiseOccupee}
            alt=''
            className={styles.chaise}
            draggable={false}
        />
    )
}