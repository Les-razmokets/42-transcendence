import { Logo } from "../../primitives/Logo";
import { EnTeteBase } from "./EnTeteBase";
import { Link } from "react-router";
import styles from "./EnTete.module.css";

type EnTeteLobbyProps = {
    userName: string;
    libelleAccount: string;
};

export function EnTeteLobby(props: EnTeteLobbyProps) {
    return (
        <EnTeteBase
        {...props}
        left={
            <>
                <Link to="/" className={`${styles.linkLogo} ${styles.mobile}`}><Logo variante="m"/></Link>
                <Link to="/" className={`${styles.linkLogo} ${styles.desktop}`}><Logo variante="l"/></Link>
            </>
        }
        />
    );
}