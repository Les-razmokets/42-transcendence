import styles from './Badge.module.css';
import type { ReactNode } from 'react';

type BadgeProps = {
    variante?: 'neutre' | 'info' | 'alerte';
    children: ReactNode;
};

export function Badge(props: BadgeProps) {
    const { variante = 'neutre', children} = props;
    return (
        <span className={`${styles.badge} ${styles[variante]} typo-legende-forte`}>
            {children}
        </span>
    );
}


