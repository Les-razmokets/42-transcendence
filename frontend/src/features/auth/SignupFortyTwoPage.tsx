import { useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Bandes, Bouton, ChampSaisie, Logo, Notification } from "@/design-system";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session/contexte";
import { completerInscription42} from "./api";
import { estMajeur } from "./validation";
import styles from "./LoginPage.module.css";

export function SignupFortyTwoPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { connect, user, load } = useSession();

	const [dateNaissance, setDateNaissance] = useState('');
	const [erreurDate, setErreurDate] = useState<string | null>(null);
	const [erreurServeur, setErreurServeur] = useState<string | null>(null);
	const [expire, setExpire] = useState(false);
	const [envoi, setEnvoi] = useState(false);

	async function envoyer(ev: SubmitEvent<HTMLFormElement>) {
		ev.preventDefault();
		setErreurServeur(null);

		if(!dateNaissance) {
			setErreurDate(t('inscription.erreurObligatoire'));
			return;
		}
		if(!estMajeur(dateNaissance)) {
			setErreurDate(t('inscription.erreurAge'));
			return;
		}
		setErreurDate(null);

		setEnvoi(true);
		try{
			await completerInscription42(dateNaissance);
			await connect();
			navigate('/', { replace: true });
		}
		catch (err) {
			if (err instanceof ApiError && err.status === 400)
				setErreurDate(t('inscription42.erreurDate'));
			else if (err instanceof ApiError && err.status === 401)
				setExpire(true);
			else if (err instanceof ApiError && err.status === 409)
				setErreurServeur(t('inscription42.erreurConflit'));
			else if (err instanceof ApiError && err.status === 429)
				setErreurServeur(t('inscription.erreurTropDeTentatives'));
			else
				setErreurServeur(t('inscription.erreurServeur'));
		} finally {
			setEnvoi(false);
		}
	}

	if (load)
		return (null);
	if (user)
			return <Navigate to="/" replace />

	return (
		<div className={styles.page}>
			<form className={styles.formulaire} onSubmit={envoyer} noValidate>
				<Logo variante="xl"/>
				<Bandes variante="epaisse"/>

				<div className={styles.entete}>
					<h1 className="typo-titre-2">{t('inscription42.titre')}</h1>
					<p className={`${styles.secondaire} typo-texte-petit`}>{t('inscription42.sousTitre')}</p>
				</div>

				<ChampSaisie
					libelle={t('inscription.dateNaissance')}
					type="date"
					autoComplete="bday"
					value={dateNaissance}
					onChange={(e) => setDateNaissance(e.target.value)}
					erreur={erreurDate ?? undefined}
				/>

				{erreurServeur && <Notification variante="erreur">{erreurServeur}</Notification>}

				{expire ? (
					<>
						<Notification variante="erreur">{t('inscription42.sessionExpiree')}</Notification>
						<Bouton
							type="button"
							className={styles.large}
							onClick={() => (window.location.href = '/api/auth/42')}
						>
							{t('inscription42.recommencer')}
						</Bouton>
					</>
				) : (
					<Bouton type="submit" disabled={envoi} className={styles.large}>
						{envoi ? t('inscription.enCours') : t('inscription.creer')}
					</Bouton>
				)}

				<p className={`${styles.secondaire} typo-legende`}>{t('inscription.conditions')}</p>

				<Link to="/login" className={`${styles.lien} typo-texte-petit`}>
				{t('inscription42.retourConnexion')}
				</Link>
			</form>
		</div>
	);
}
