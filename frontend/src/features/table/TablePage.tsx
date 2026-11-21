import { useState } from 'react';
import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Notification } from '@/design-system';
import { SceneTable } from '@/three';
import { placesTable } from './format';
import type { chargerTable } from './loader';
import styles from './TablePage.module.css';

export function TablePage() {
    const table = useLoaderData<typeof chargerTable>();
    const { t } = useTranslation();
    const [choisie, setChoisie] = useState<number | null>(null);

    if (!table)
        return <Notification variante="erreur">{t('table.erreurChargement')}</Notification>;

    return (
        <div className={styles.page} style={{ viewTransitionName: `table-${table.id}` }}>
            <SceneTable places={placesTable(table, choisie)} onChoisir={setChoisie} />
        </div>
    );
}

