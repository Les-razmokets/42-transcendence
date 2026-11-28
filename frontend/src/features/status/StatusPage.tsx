import { useEffect, useState } from 'react';
import { request, ApiError } from '../../lib/api';
import { useTranslation } from 'react-i18next';
import styles from './StatusPage.module.css';

export function StatusPage() {
	const { t } = useTranslation();
	const [backend, setBackend] = useState('chargement');
	const [db, setDb] = useState('chargement');
	useEffect(() => {
		async function verifier() {
			try {
				await request('GET', '/health');
				setBackend('ok');
				setDb('ok');
			} catch (erreur) {
				if (erreur instanceof ApiError && erreur.status === 503) {
					setDb('panne');
					setBackend('ok');
				} else {
					setBackend('panne');
					setDb('inconnu')
				}
			}
		}
		verifier();                                   // tout de suite
		const minuteur = setInterval(verifier, 5000); // puis toutes les 5 s
		return () => clearInterval(minuteur);         // arrêt quand on quitte la page
	}, []);

	return (
		<>
			<main className={styles.page}>
				<h1>{t('statut.titre')}</h1>
				<p>{t('statut.backend')} : {t(`statut.${backend}`)}</p>
				<p>{t('statut.base')} : {t(`statut.${db}`)}</p>
			</main>
		</>
	);
}
