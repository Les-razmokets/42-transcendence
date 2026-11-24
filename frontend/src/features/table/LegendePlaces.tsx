import { useTranslation } from 'react-i18next';
import styles from './TablePage.module.css';

const ETATS = [
    { cle: 'libre', classe: styles.libre },
    { cle: 'occupee', classe: styles.occupee },
    { cle: 'taPlace', classe: styles.taPlace },
] as const;

export function LegendePlaces() {
    const { t } = useTranslation();

    return (
        <ul className={styles.legende}>
            {ETATS.map(({ cle, classe }) => (
                <li key={cle} className={`${styles.elementLegende} typo-legende`}>
                    <span className={`${styles.pastille} ${classe}`} aria-hidden="true" />
                    {t(`table.legende.${cle}`)}
                </li>
            ))}
        </ul>
    );
}