import type { ButtonHTMLAttributes } from 'react';
import styles from './Bouton.module.css';

type BoutonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'principal' | 'secondaire' | 'accent';
};

export function Bouton(props: BoutonProps) {
  const { variante = 'principal', className, ...reste } = props;

  return (
    <button
      {...reste}
      className={`${styles.bouton} ${styles[variante]} typo-texte-fort ${className ?? ''}`}
    />
  );
}
