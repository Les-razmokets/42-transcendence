import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./Modale.module.css";

type ModaleProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    beforeTitle?: ReactNode;
    children: ReactNode;
    actions?: ReactNode;
};

export function Modale(props: ModaleProps) {
    const { open, onClose, title, beforeTitle,children, actions} = props;
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const d = dialog.current;
        if (!d)
            return;
        if (open && !d.open)
            d.showModal();
        if (!open && d.open)
            d.close();
    }, [open]);

    function clic(e: MouseEvent<HTMLDialogElement>) {
        if (e.target === e.currentTarget)
            onClose();
    }

    return (
        <dialog ref={dialog} className={styles.modale} onClose={onClose} onClick={clic}>
            <div className={styles.contenu}>
                {beforeTitle}
                <h2 className="typo-titre-2">{title}</h2>
                {children}
                {actions && <div className={styles.actions}>{actions}</div>}
            </div>
        </dialog>
    );
}