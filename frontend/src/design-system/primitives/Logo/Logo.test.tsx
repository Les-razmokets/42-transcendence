import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';
import styles from './Logo.module.css';

describe('Logo', () => {
  it('affiche FLOOR', () => {
    render(<Logo />);

    expect(screen.getByText('FLOOR')).toBeInTheDocument();
  });

  it('applique le style du logo', () => {
    render(<Logo />);

    expect(screen.getByText('FLOOR')).toHaveClass(styles.logo);
  });

  it('est en taille l par défaut', () => {
    render(<Logo />);

    expect(screen.getByText('FLOOR')).toHaveClass('typo-logo-l');
  });

  it.each([
    ['m', 'typo-logo-m'],
    ['l', 'typo-logo-l'],
    ['xl', 'typo-logo-xl'],
  ] as const)('applique la typo de la variante %s', (variante, classe) => {
    render(<Logo variante={variante} />);

    expect(screen.getByText('FLOOR')).toHaveClass(classe);
  });
});
