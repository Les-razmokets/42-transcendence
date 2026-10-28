import { Avatar } from "../../primitives/Avatar";
import type { NomIcone } from "../../icones";
import { LigneMenu } from "../LigneMenu";
import styles from "./NavigationCompte.module.css";

type Lien = {
    libelle: string;
    icone: NomIcone;
    link: string;
};

type NavigationCompteProps = {
    nom: string;
    email: string;
    points: string;
    libellePoints: string;
    liens: Lien[];
    libelleDeconnexion: string;
    onDeconnexion: () => void;
};

export function NavigationCompte(props: NavigationCompteProps) {
    const { nom, email, points, libellePoints, liens, libelleDeconnexion, onDeconnexion} = props;

    return (
        <nav className={styles.navigation}>
            {/* haut de la page juste le profil */}
            <div className={styles.profil}>
                <Avatar nom={nom} taille="l"/>
                <div className={styles.identite}>
                    <span className="typo-titre-3">{nom}</span>
                    <span className={`${styles.secondaire} typo-texte-petit`}>{email}</span>
                </div>
            </div>
            {/* affichage des points de fidélité */}
            <div className={styles.points}>
                <span className={`${styles.secondaire} typo-surtitre`}>{libellePoints}</span>
                <span className="typo-affiche-titre">{points}</span>
            </div>

            {/* l'affichage des pages avec le composant ligne menu */}
            <div className={styles.menu}>
                {liens.map((lien) => (
                    <LigneMenu
                        key={lien.link}
                        libelle={lien.libelle}
                        icone={lien.icone}
                        link={lien.link}
                    />
                ))}
                <LigneMenu
                    libelle={libelleDeconnexion}
                    icone="sortie"
                    danger
                    chevron={false}
                    onClick={onDeconnexion}
                />
            </div>
        </nav>
    );
}