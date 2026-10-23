import { QRCodeSVG } from 'qrcode.react';
import styles from './QrCode.module.css';

type QrCodeProps = {
    valeur: string;
    taille?: number;
    libelle: string;
};

export function QrCode(props: QrCodeProps) {
    const { valeur, libelle, taille = 200} = props;

    return (
        <div className={styles.qrcode} role="img" aria-label={libelle}>
            <QRCodeSVG
                value={valeur}
                size={taille}
                fgColor='currentColor'
                bgColor='transparent'
                level='M'
                aria-hidden="true"
            />
        </div>
    );
}