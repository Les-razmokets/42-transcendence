import type { ButtonHTMLAttributes } from 'react';
import type { NomIcone} from '../../icones/icones.data.ts';
import { Icone} from '../../icones';
import styles from './BoutonIcone.module.css'

type BoutonIconeProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icone: NomIcone,
  libelle: string
};

export function BoutonIcone(props: BoutonIconeProps) {
  const { icone, libelle,className, ...reste } = props;
  return (
    <button
      {...reste}
      aria-label={libelle}
      className={`${styles.boutonIcone} ${className ?? ''}`}>
      <Icone nom={icone} taille={20}/>
    </button>
  );
}



