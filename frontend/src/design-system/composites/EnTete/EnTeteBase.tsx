import type { ReactNode } from "react";
import { Link } from "react-router";
import { Avatar } from "../../primitives/Avatar";
import { Bandes } from "../../primitives/Bandes";
import styles from "./EnTete.module.css";

type EnTeteBaseProps = {
    left: ReactNode;
    center?: ReactNode;
    userName: string;
    libelleAccount: string;
};

export function EnTeteBase(props: EnTeteBaseProps) {
    const { left, center, userName, libelleAccount} = props;

    return (
        <header className={styles.enTete}>
            <div className={styles.barre}>
                {left}
                {center}
                <Link to="/compte" aria-label={libelleAccount} className={styles.linkAccount}>
                    <Avatar nom={userName}/>
                </Link>
            </div>
            <Bandes variante="epaisse"/>
        </header>
    );
}