import styles from './Logo.module.css'

type LogoProps = {
  variante?: 'm' | 'l' | 'xl';
};

const classTypo = {
  m: 'typo-logo-m',
  l: 'typo-logo-l',
  xl: 'typo-logo-xl',
} as const;

export function Logo(props: LogoProps) {
  const { variante = 'l' } = props;
  return <span className={`${styles.logo} ${classTypo[variante]}`}>FLOOR</span>
}