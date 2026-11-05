import { useState, type SubmitEvent } from "react";
import { Link, useNavigate} from "react-router";
import { useTranslation } from "react-i18next";
import { Bandes, Bouton, ChampSaisie, Logo } from "../../design-system";
import { ApiError} from "../../lib/api";
import { login } from "./api";
import styles from "./LoginPage.module.css";

export function LoginPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [enCours, setEnCours] = useState(false);

	async function envoyer(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setEnCours(true);
		try {
			await login(email, password);
			navigate('/');
		} catch(err) {
			if (err instanceof ApiError && err.status === 401)
				setError(t('connexion.erreurIdentifiants'));
			else if (err instanceof ApiError && err.status === 429)
				setError(t('connexion.erreurTropDeTentatives'));
			else
				setError(t('connexion.erreurGenerique'));
		} finally {
			setEnCours(false);
		}
	}

	return (
		<main className={styles.page}>
			<form className={styles.formulaire} onSubmit={envoyer} noValidate>
				<span className={styles.logo}><Logo variante="xl"/></span>
				<Bandes variante="epaisse"/>

				<div className={styles.entete}>
					<h1 className="typo-titre-2">{t('connexion.titre')}</h1>
					<p className={`${styles.secondaire} typo-texte-petit`}>{t('connexion.sousTitre')}</p>
				</div>

				<ChampSaisie
					libelle={t('connexion.email')}
					type="email"
					autoComplete="email"
					placeholder={t('connexion.emailIndication')}
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					erreur={error ?? undefined}
				/>
				<ChampSaisie
					libelle={t('connexion.motDePasse')}
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>

				<Link to="/forgot-password" className={`${styles.lien} typo-texte-petit`}>
					{t('connexion.oublie')}
				</Link>

				<Bouton type="submit" disabled={enCours} className={styles.large}>
					{ enCours ? t('connexion.enCours') : t('connexion.seConnecter')}
				</Bouton>

				<span className={`${styles.secondaire} typo-legende`}>{t('connexion.ou')}</span>

				<Bouton 
					variante="secondaire"
					className={styles.large}
					onClick={() => (window.location.href = '/api/auth/42')}
				>
					{t('connexion.avec42')}
				</Bouton>

				<p className={`${styles.secondaire} typo-texte-petit`}>
					{t('connexion.pasDeCompte')}{' '}
					<Link to='/register' className={styles.lien}>{t('connexion.creerCompte')}</Link>
				</p>
			</form>
		</main>
	);
};