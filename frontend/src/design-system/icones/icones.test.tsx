import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icone } from './icones';
import { icones } from './icones.data';

describe('Icone', () => {
  it('est annoncée comme une image quand elle a un libellé', () => {
    render(<Icone nom="carte" libelle="Paiement par carte" />);

    expect(screen.getByRole('img', { name: 'Paiement par carte' })).toBeInTheDocument();
  });

  it("est cachée aux lecteurs d'écran sans libellé", () => {
    const { container } = render(<Icone nom="carte" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('mesure 24 px par défaut', () => {
    const { container } = render(<Icone nom="carte" />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '24');
  });

  it('applique la taille demandée', () => {
    const { container } = render(<Icone nom="carte" taille={16} />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });

  it('dessine le tracé correspondant au nom', () => {
    const { container } = render(<Icone nom="carte" />);

    expect(container.querySelector('path')).toHaveAttribute('d', icones.carte);
  });
});
