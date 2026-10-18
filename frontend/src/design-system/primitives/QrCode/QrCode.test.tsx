import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QrCode } from './QrCode';
import styles from './QrCode.module.css';

describe('QrCode', () => {
  it('est exposé comme une image avec son libellé', () => {
    render(<QrCode valeur="FLR-1610-0042" libelle="QR code de réservation" />);

    expect(
      screen.getByRole('img', { name: 'QR code de réservation' }),
    ).toBeInTheDocument();
  });

  it('applique le style du conteneur', () => {
    render(<QrCode valeur="FLR-1610-0042" libelle="QR code de réservation" />);

    expect(screen.getByRole('img')).toHaveClass(styles.qrcode);
  });

  it('affiche un code SVG', () => {
    const { container } = render(
      <QrCode valeur="FLR-1610-0042" libelle="QR code de réservation" />,
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('svg path')).toBeInTheDocument();
  });

  it('a une taille de 200px par défaut', () => {
    const { container } = render(
      <QrCode valeur="FLR-1610-0042" libelle="QR code de réservation" />,
    );

    expect(container.querySelector('svg')).toHaveAttribute('width', '200');
    expect(container.querySelector('svg')).toHaveAttribute('height', '200');
  });

  it('applique la taille demandée', () => {
    const { container } = render(
      <QrCode valeur="FLR-1610-0042" libelle="Miniature" taille={72} />,
    );

    expect(container.querySelector('svg')).toHaveAttribute('width', '72');
    expect(container.querySelector('svg')).toHaveAttribute('height', '72');
  });

  it('encode la valeur : deux valeurs différentes donnent deux codes différents', () => {
    const { container: premier } = render(
      <QrCode valeur="FLR-1610-0042" libelle="Code A" />,
    );
    const { container: second } = render(
      <QrCode valeur="FLR-1610-0043" libelle="Code B" />,
    );

    expect(
      premier.querySelectorAll('svg path')[1]?.getAttribute('d'),
    ).not.toBe(second.querySelectorAll('svg path')[1]?.getAttribute('d'));
  });

  it('donne le même code pour la même valeur', () => {
    const { container: premier } = render(
      <QrCode valeur="FLR-1610-0042" libelle="Code A" />,
    );
    const { container: second } = render(
      <QrCode valeur="FLR-1610-0042" libelle="Code B" />,
    );

    expect(
      premier.querySelectorAll('svg path')[1]?.getAttribute('d'),
    ).toBe(second.querySelectorAll('svg path')[1]?.getAttribute('d'));
  });

  it('prend la couleur du texte du conteneur (currentColor)', () => {
    const { container } = render(
      <QrCode valeur="FLR-1610-0042" libelle="QR code de réservation" />,
    );

    const traces = Array.from(container.querySelectorAll('svg path'));
    expect(
      traces.some((trace) => trace.getAttribute('fill') === 'currentColor'),
    ).toBe(true);
  });

  it("cache le SVG aux lecteurs d'écran pour éviter un doublon avec le libellé", () => {
    const { container } = render(
      <QrCode valeur="FLR-1610-0042" libelle="QR code de réservation" />,
    );

    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
