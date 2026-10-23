import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import styles from './Badge.module.css';

describe('Badge', () => {
  it('affiche son contenu', () => {
    render(<Badge>Nouveau</Badge>);

    expect(screen.getByText('Nouveau')).toBeInTheDocument();
  });

  it('applique le style du badge et la typo', () => {
    render(<Badge>Nouveau</Badge>);

    expect(screen.getByText('Nouveau')).toHaveClass(styles.badge);
    expect(screen.getByText('Nouveau')).toHaveClass('typo-legende-forte');
  });

  it('est neutre par défaut', () => {
    render(<Badge>Nouveau</Badge>);

    expect(screen.getByText('Nouveau')).toHaveClass(styles.neutre);
    expect(screen.getByText('Nouveau')).not.toHaveClass(styles.info);
    expect(screen.getByText('Nouveau')).not.toHaveClass(styles.alerte);
  });

  it.each(['neutre', 'info', 'alerte'] as const)(
    'applique la variante %s',
    (variante) => {
      render(<Badge variante={variante}>Nouveau</Badge>);

      expect(screen.getByText('Nouveau')).toHaveClass(styles[variante]);
    },
  );

  it("n'applique qu'une seule variante à la fois", () => {
    render(<Badge variante="info">Nouveau</Badge>);

    expect(screen.getByText('Nouveau')).toHaveClass(styles.info);
    expect(screen.getByText('Nouveau')).not.toHaveClass(styles.neutre);
    expect(screen.getByText('Nouveau')).not.toHaveClass(styles.alerte);
  });
});
