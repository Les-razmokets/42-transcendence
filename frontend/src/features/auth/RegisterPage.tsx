import { useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Logo, Bandes, ChampSaisie, Bouton, Notification } from "@/design-system";
import { ApiError } from "@/lib/api";
import { inscription, type DonneeInscription } from "./api";
import styles from "./LoginPage.module.css";

type Erreurs = Partial<Record<keyof DonneeInscription, string>>;

const REGEX_PSEUDO = /^[a-z0-9_-]{1,20}$/i;
const REGEX_MOT_DE_PASSE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[-#!$@£%^&*()_+|~=`{}[\]:";'<>?,./\\ ]).{8,128}$/;



function estMajeur(date: string) {
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() - 18);
    return date <= limite.toISOString().slice(0, 10);
}

export function RegisterPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [champs, setChamps] = useState<DonneeInscription>({
        prenom: '', nom: '', pseudo: '', email: '', motDePasse: '', dateNaissance: '',
    });
    const [erreurs, setErreurs] = useState<Erreurs>({});
    const [erreurServeur, setErreurServeur] = useState<string | null>(null);
    const [envoi, setEnvoi] = useState(false);

    function modifier(cle: keyof DonneeInscription, valeur: string) {
        setChamps({ ...champs, [cle]: valeur });
    }

    function valider(): Erreurs {
        const e: Erreurs = {};
        if (!champs.prenom.trim())
            e.prenom = t('inscription.erreurObligatoire');
        if (!champs.nom.trim())
            e.nom = t('inscription.erreurObligatoire');
        if (!REGEX_PSEUDO.test(champs.pseudo.trim()))
            e.pseudo = t('inscription.erreurPseudo');
        if (!champs.email.includes('@'))
            e.email = t('inscription.erreurEmail');
        if (!REGEX_MOT_DE_PASSE.test(champs.motDePasse))
            e.motDePasse = t('inscription.erreurMotDePasse');
        if (!champs.dateNaissance)
            e.dateNaissance = t('inscription.erreurObligatoire');
        else if (!estMajeur(champs.dateNaissance))
            e.dateNaissance = t('inscription.erreurAge');
        return e;
    }

    async function envoyer(ev: SubmitEvent<HTMLFormElement>) {
        ev.preventDefault();
        setErreurServeur(null);

        const e = valider();
        setErreurs(e);
        if (Object.keys(e).length > 0)
            return;

        setEnvoi(true);
        try {
            await inscription(champs);
            navigate('/login', { state: { inscrit: true } });
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                if (err.message.startsWith('Pseudo'))
                    setErreurs({ pseudo: t('inscription.erreurPseudoUtilise')});
                else
                    setErreurs({ email: t('inscription.erreurEmailUtilise') });
            }
            else if (err instanceof ApiError && err.status === 429)
                setErreurServeur(t('inscription.erreurTropDeTentatives'));
            else if (err instanceof ApiError && err.status === 400)
                setErreurServeur(err.message);
            else
                setErreurServeur(t('inscription.erreurServeur'));
        } finally {
            setEnvoi(false);
        }
    }

    return (
        <div className={styles.page}>
            <form className={styles.formulaire} onSubmit={envoyer} noValidate>
                <Logo variante="xl"/>
                <Bandes variante="epaisse"/>

                <div className={styles.entete}>
                    <h1 className="typo-titre-2">{t('inscription.titre')}</h1>
                    <p className={`${styles.secondaire} typo-texte-petit`}>{t('inscription.sousTitre')}</p>
                </div>

                <ChampSaisie
                    libelle={t('inscription.prenom')}
                    autoComplete="given-name"
                    value={champs.prenom}
                    onChange={(e) => modifier('prenom', e.target.value)}
                    erreur={erreurs.prenom}
                />
                <ChampSaisie
                    libelle={t('inscription.nom')}
                    autoComplete="family-name"
                    value={champs.nom}
                    onChange={(e) => modifier('nom', e.target.value)}
                    erreur={erreurs.nom}
                />
                <ChampSaisie
                    libelle={t('inscription.pseudo')}
                    autoComplete="username"
                    aide={t('inscription.pseudoAide')}
                    value={champs.pseudo}
                    onChange={(e) => modifier('pseudo', e.target.value)}
                    erreur={erreurs.pseudo}
                />
                <ChampSaisie
                    libelle={t('inscription.email')}
                    type="email"
                    autoComplete="email"
                    placeholder={t('connexion.emailIndication')}
                    value={champs.email}
                    onChange={(e) => modifier('email', e.target.value)}
                    erreur={erreurs.email}
                />
                <ChampSaisie
                    libelle={t('inscription.motDePasse')}
                    type="password"
                    autoComplete="new-password"
                    aide={t('inscription.motDePasseAide')}
                    value={champs.motDePasse}
                    onChange={(e) => modifier('motDePasse', e.target.value)}
                    erreur={erreurs.motDePasse}
                />
                <ChampSaisie
                    libelle={t('inscription.dateNaissance')}
                    type="date"
                    autoComplete="bday"
                    value={champs.dateNaissance}
                    onChange={(e) => modifier('dateNaissance', e.target.value)}
                    erreur={erreurs.dateNaissance}
                />

                {erreurServeur && <Notification variante="erreur">{erreurServeur}</Notification>}

                <Bouton type="submit" disabled={envoi} className={styles.large}>
                    {envoi ? t('inscription.enCours') : t('inscription.creer')}
                </Bouton>

                <p className={`${styles.secondaire} typo-legende`}>{t('inscription.conditions')}</p>

                <p className={`${styles.secondaire} typo-texte-petit`}>
                    {t('inscription.dejaCompte')}{' '}
                    <Link to="/login" className={styles.lien}>{t('inscription.seConnecter')}</Link>
                </p>
            </form>
        </div>
    );
}