import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar } from './Avatar';
import styles from './Avatar.module.css';

describe('Avatar', () => {
  it('affiche les initiales du prénom et du nom', () => {
    const { container } = render(<Avatar nom="Dusan Fama" />);

    expect(container.firstChild).toHaveTextContent('DF');
  });

  it('se limite aux deux premiers mots', () => {
    const { container } = render(<Avatar nom="Jean Benoit Jacques" />);

    expect(container.firstChild).toHaveTextContent('JB');
  });

  it('met les initiales en majuscules', () => {
    const { container } = render(<Avatar nom="marie curie" />);

    expect(container.firstChild).toHaveTextContent('MC');
  });

  it('ignore les espaces en trop', () => {
    const { container } = render(<Avatar nom="  marie   curie  " />);

    expect(container.firstChild).toHaveTextContent('MC');
  });

  it("affiche une seule initiale pour un nom d'un seul mot", () => {
    const { container } = render(<Avatar nom="Alice" />);

    expect(container.firstChild).toHaveTextContent('A');
  });

  it("est cachée aux lecteurs d'écran", () => {
    const { container } = render(<Avatar nom="Dusan Fama" />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('applique le style de l’avatar', () => {
    const { container } = render(<Avatar nom="Dusan Fama" />);

    expect(container.firstChild).toHaveClass(styles.avatar);
  });

  it('est en taille m par défaut', () => {
    const { container } = render(<Avatar nom="Dusan Fama" />);

    expect(container.firstChild).toHaveClass(styles.m);
    expect(container.firstChild).not.toHaveClass(styles.l);
  });

  it.each([
    ['m', 'typo-libelle-fort'],
    ['l', 'typo-titre-3'],
  ] as const)('applique la taille et la typo de la variante %s', (taille, typo) => {
    const { container } = render(<Avatar nom="Dusan Fama" taille={taille} />);

    expect(container.firstChild).toHaveClass(styles[taille]);
    expect(container.firstChild).toHaveClass(typo);
  });
});
