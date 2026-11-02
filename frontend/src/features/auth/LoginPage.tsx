import { useState } from "react";
import { Link, useNavigate} from "react-router";
import { useTranslation } from "react-i18next";
import { Bandes, Bouton, ChampSaisie, Logo, Notification } from "../../design-system";
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

	async function envoyer() {
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
		<div className={styles.page}>
			<form
				className={styles.formulaire}
				onSubmit={(e) => {
					e.preventDefault();
					void envoyer();
				}}
				>
					<span className={styles.logo}><Logo variante="xl"/></span>
					<Bandes variante="epaisse"/>
					<h1 className="typo-titre-1">{t('connexion.titre')}</h1>
					<p className={styles.sousTitre}>{t('connexion.sousTitre')}</p>
					{error && <Notification variante="erreur">{error}</Notification>}

					<ChampSaisie
						libelle={t('connexion.email')}
						type="email"
						autoComplete="email"
						placeholder={t('connexion.emailIndication')}
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<ChampSaisie
						libelle={t('connexion.motDePasse')}
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>

					<Bouton type="submit" disabled={enCours}>
						{enCours ? t('connexion.enCours') : t('connexion.seConnecter')}
					</Bouton>

					<p className={styles.bas}>
						{t('connexion.pasDeCompte')} <Link to="/register">{t('connexion.creerCompte')}</Link>
					</p>
				</form>
		</div>
	);
};