import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Notification } from './Notification';
import styles from './Notification.module.css';
import { icones } from '../../icones/icones.data';

describe('Notification', () => {
  it('affiche son message', () => {
    render(<Notification>Modifications enregistrées</Notification>);

    expect(screen.getByText('Modifications enregistrées')).toBeInTheDocument();
  });

  it('applique le style de la notification et la typo', () => {
    render(<Notification>Modifications enregistrées</Notification>);

    expect(screen.getByRole('status')).toHaveClass(
      styles.notification,
      'typo-texte-fort',
    );
  });

  describe('variante succès (par défaut)', () => {
    it('est annoncée poliment aux lecteurs d’écran (role status)', () => {
      render(<Notification>Modifications enregistrées</Notification>);

      expect(screen.getByRole('status')).toHaveTextContent(
        'Modifications enregistrées',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('applique la classe succes et pas erreur', () => {
      render(<Notification>Modifications enregistrées</Notification>);

      expect(screen.getByRole('status')).toHaveClass(styles.succes);
      expect(screen.getByRole('status')).not.toHaveClass(styles.erreur);
    });

    it('affiche l’icône coche', () => {
      const { container } = render(
        <Notification>Modifications enregistrées</Notification>,
      );

      expect(container.querySelector('path')).toHaveAttribute(
        'd',
        icones.coche,
      );
    });
  });

  describe('variante erreur', () => {
    it('est annoncée immédiatement aux lecteurs d’écran (role alert)', () => {
      render(<Notification variante="erreur">Paiement refusé</Notification>);

      expect(screen.getByRole('alert')).toHaveTextContent('Paiement refusé');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('applique la classe erreur et pas succes', () => {
      render(<Notification variante="erreur">Paiement refusé</Notification>);

      expect(screen.getByRole('alert')).toHaveClass(styles.erreur);
      expect(screen.getByRole('alert')).not.toHaveClass(styles.succes);
    });

    it('affiche l’icône info', () => {
      const { container } = render(
        <Notification variante="erreur">Paiement refusé</Notification>,
      );

      expect(container.querySelector('path')).toHaveAttribute('d', icones.info);
    });
  });

  it('cache l’icône aux lecteurs d’écran', () => {
    const { container } = render(
      <Notification>Modifications enregistrées</Notification>,
    );

    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('affiche l’icône à 20px', () => {
    const { container } = render(
      <Notification>Modifications enregistrées</Notification>,
    );

    expect(container.querySelector('svg')).toHaveAttribute('width', '20');
    expect(container.querySelector('svg')).toHaveAttribute('height', '20');
  });
});
