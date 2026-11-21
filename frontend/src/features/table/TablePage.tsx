import { useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bouton, Notification } from '@/design-system';
import { EnTeteTable } from '@/design-system/composites/EnTete';
import { useSession } from '@/lib/session/contexte';
import { SceneTable } from '@/three';
import { jeu } from '../lobby/format';
import { placesTable } from './format';
import { LegendePlaces } from './LegendePlaces';
import type { chargerTable } from './loader';
import styles from './TablePage.module.css';

type Etape = 'choix' | 'descente' | 'assis';

export function TablePage() {
    const donnees = useLoaderData<typeof chargerTable>();
    const { user } = useSession();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [choisie, setChoisie] = useState<number | null>(null);
    const [etape, setEtape] = useState<Etape>('choix');
    const [assise, setAssise] = useState(false);

    if (!user)
        return null;
    if (!donnees)
        return <Notification variante="erreur">{t('table.erreurChargement')}</Notification>;

    const { table, casino } = donnees;
    const libres = table.seats.filter((s) => s.status === 'FREE').length;

    function confirmer() {
        setAssise(true);
        setEtape('descente');
    }

    function retour() {
        if (assise) {
            setAssise(false);
            setEtape('descente');
        } else {
            navigate('/', { viewTransition: true });
        }
    }

    const titre = etape === 'assis' && choisie !== null
        ? t('table.titrePlace', { place: choisie + 1, table: table.name })
        : casino.name;
    const details = etape === 'assis'
        ? `${casino.name} · ${jeu(table)}`
        : `${table.name} · ${jeu(table)}`;

    return (
        <div className={`${styles.page} ${assise ? styles.pageAssise : ''}`}>
            <EnTeteTable
                userName={`${user.firstName} ${user.lastName}`}
                libelleAccount={t('entete.monCompte')}
                titre={titre}
                details={details}
                libelleReturn={assise ? t('table.seLever') : t('table.retour')}
                onRetour={retour}
            />
            <main className={styles.contenu}>
                <div className={styles.scene} style={{ viewTransitionName: `table-${table.id}` }}>
                    <SceneTable
                        places={placesTable(table, choisie)}
                        onChoisir={setChoisie}
                        placeAssise={assise ? choisie : null}
                        onAssis={() => setEtape('assis')}
                        onDebout={() => setEtape('choix')}
                    />
                </div>

                {etape === 'choix' && (
                    <>
                        <p className={`${styles.consigne} typo-surtitre`}>
                            {t('table.choisisTaPlace', { count: libres })}
                        </p>
                        <div className={styles.bas}>
                            {choisie !== null && (
                                <Bouton onClick={confirmer}>
                                    {t('table.confirmer', { place: choisie + 1 })}
                                </Bouton>
                            )}
                            <LegendePlaces />
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

