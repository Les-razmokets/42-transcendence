import { Logo } from "../../primitives/Logo";
import { EnTeteBase } from "./EnTeteBase";
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
            <span className={styles.mobile}><Logo variante="m"/></span>
            <span className={styles.desktop}><Logo variante="l"/></span>
            </>
        }
        />
    );
}