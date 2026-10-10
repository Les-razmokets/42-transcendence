import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Bandes } from './Bandes';
import styles from './Bandes.module.css';

describe('Bandes', () => {
  it('affiche trois bandes', () => {
    const { container } = render(<Bandes />);

    expect(container.querySelectorAll('span')).toHaveLength(3);
  });

  it("est cachée aux lecteurs d'écran", () => {
    const { container } = render(<Bandes />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('est épaisse par défaut', () => {
    const { container } = render(<Bandes />);

    expect(container.firstChild).toHaveClass(styles.epaisse);
    expect(container.firstChild).not.toHaveClass(styles.fine);
  });

  it('applique la variante fine', () => {
    const { container } = render(<Bandes variante="fine" />);

    expect(container.firstChild).toHaveClass(styles.fine);
    expect(container.firstChild).not.toHaveClass(styles.epaisse);
  });
});
