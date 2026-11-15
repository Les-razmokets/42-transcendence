import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Table } from "@transcendence/shared";
import { Notification } from "@/design-system";
import { CarteTable } from "@/design-system/composites/CarteTable";
import { getCasinos, getTables } from "./api";
import { details, toPlaces } from "./format";
import styles from './LobbyPage.module.css';

export function LobbyPage() {
	const { t } = useTranslation();
	const [tables, setTables] = useState<Table[]>([]);
	const [casinos, setCasinos] = useState<Map<string, string>>(new Map());
	const [load, setLoad] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
        let annule = false;

        Promise.all([getTables(), getCasinos()])
            .then(([listeTables, listeCasinos]) => {
                if (annule) return;
                setTables(listeTables.filter((table) => table.status === 'OPEN'));
                setCasinos(new Map(listeCasinos.map((c) => [c.id, c.name])));
            })
            .catch(() => {
                if (!annule) setError(true);
            })
            .finally(() => {
                if (!annule) setLoad(false);
            });

        return () => {
            annule = true;
        };
    }, []);

	if (load)
		return null;
	if (error)
		return <Notification variante="erreur">{t('lobby.erreurChargement')}</Notification>
	
	if (tables.length === 0)
		return <p className="typo-texte-base">{t('lobby.aucuneTable')}</p>
	
	return (
		<ul className={styles.grille}>
			{tables.map((table) => (
				<li key={table.id}>
					<CarteTable
						casino={casinos.get(table.casinoId) ?? ''}
						details={details(table, t)}
						places={toPlaces(table)}
						link={`/tables/${table.id}`}
					/>
				</li>
			))}
		</ul>
	);
}