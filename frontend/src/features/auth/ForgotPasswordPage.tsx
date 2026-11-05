import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Bandes, Logo } from "@/design-system";
import styles from "./LoginPage.module.css";

export function ForgotPasswordPage() {
    const { t } = useTranslation();

    return (
        <div className={styles.page}>
            <div className={styles.formulaire}>
                <Logo variante="xl"/>
                <Bandes variante="epaisse"/>

                <div className={styles.entete}>
                    <h1 className="typo-titre-2">{t('motDePasseOublie.titre')}</h1>
                    <p className={`${styles.secondaire} typo-texte-petit`}>{t('motDePasseOublie.bientot')}</p>
                </div>

                <Link to="/login" className={styles.lien}>{t('motDePasseOublie.retour')}</Link>
            </div>
        </div>
    );
}
