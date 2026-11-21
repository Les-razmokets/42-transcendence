import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Notification } from '@/design-system';
import { EnTeteTable } from '@/design-system/composites/EnTete';
import { useSession } from '@/lib/session/contexte';
import { SceneTable } from '@/three';
import { jeu } from '../lobby/format';
import { placesTable } from './format';
import { LegendePlaces } from './LegendePlaces';
import type { chargerTable } from './loader';
import styles from './TablePage.module.css';

export function TablePage() {
    const donnees = useLoaderData<typeof chargerTable>();
    const { user } = useSession();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [choisie, setChoisie] = useState<number | null>(null);

    // SafeRoute garantit déjà user, mais TypeScript ne le sait pas
    if (!user)
        return null;
    if (!donnees)
        return <Notification variante="erreur">{t('table.erreurChargement')}</Notification>;

    const { table, casino } = donnees;
    const libres = table.seats.filter((s) => s.status === 'FREE').length;

    return (
        <div className={styles.page}>
            <EnTeteTable
                userName={`${user.firstName} ${user.lastName}`}
                libelleAccount={t('entete.monCompte')}
                titre={casino.name}
                details={`${table.name} · ${jeu(table)}`}
                libelleReturn={t('table.retour')}
                onRetour={() => navigate('/', { viewTransition: true })}
            />
            <main className={styles.contenu}>
                <p className={`${styles.consigne} typo-surtitre`}>
                    {t('table.choisisTaPlace', { count: libres })}
                </p>
                <div className={styles.scene} style={{ viewTransitionName: `table-${table.id}` }}>
                    <SceneTable places={placesTable(table, choisie)} onChoisir={setChoisie} />
                </div>
                <LegendePlaces />
            </main>
        </div>
    );
}

