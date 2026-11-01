import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { Modale } from './Modale';
import styles from './Modale.module.css';

// jsdom n'implémente pas showModal() / close() : on les simule.
// showModal pose l'attribut open ; close l'enlève et émet l'événement « close », comme un navigateur.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
const close = vi.fn(function (this: HTMLDialogElement) {
  if (!this.hasAttribute('open'))
    return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

afterEach(() => {
  showModal.mockClear();
  close.mockClear();
});

type Props = ComponentProps<typeof Modale>;

function renderModale(surcharge: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    onClose: () => {},
    title: 'Annuler la réservation ?',
    children: <p>Annulation gratuite</p>,
    ...surcharge,
  };
  return render(<Modale {...props} />);
}

// La modale fermée n'est pas accessible : on la cherche avec hidden: true
function dialog() {
  return screen.getByRole('dialog', { hidden: true });
}

describe('Modale', () => {
  describe('ouverture et fermeture', () => {
    it("s'ouvre en modale quand open vaut true", () => {
      renderModale({ open: true });

      expect(showModal).toHaveBeenCalledTimes(1);
      expect(dialog()).toHaveAttribute('open');
    });

    it('reste fermée quand open vaut false', () => {
      renderModale({ open: false });

      expect(showModal).not.toHaveBeenCalled();
      expect(dialog()).not.toHaveAttribute('open');
    });

    it("s'ouvre quand open passe de false à true", () => {
      const { rerender } = renderModale({ open: false });

      rerender(<Modale open onClose={() => {}} title="Titre">contenu</Modale>);

      expect(showModal).toHaveBeenCalledTimes(1);
      expect(dialog()).toHaveAttribute('open');
    });

    it('se ferme quand open passe de true à false', () => {
      const { rerender } = renderModale({ open: true });

      rerender(<Modale open={false} onClose={() => {}} title="Titre">contenu</Modale>);

      expect(close).toHaveBeenCalledTimes(1);
      expect(dialog()).not.toHaveAttribute('open');
    });

    it("n'appelle pas showModal une 2e fois si elle est déjà ouverte", () => {
      const { rerender } = renderModale({ open: true });

      rerender(<Modale open onClose={() => {}} title="Autre titre">contenu</Modale>);

      expect(showModal).toHaveBeenCalledTimes(1);
    });

    it("n'appelle pas close si elle est déjà fermée", () => {
      const { rerender } = renderModale({ open: false });

      rerender(<Modale open={false} onClose={() => {}} title="Autre titre">contenu</Modale>);

      expect(close).not.toHaveBeenCalled();
    });
  });

  describe('onClose', () => {
    it('est appelé quand le navigateur ferme la modale (touche Échap)', () => {
      const auFermer = vi.fn();
      renderModale({ onClose: auFermer });

      fireEvent(dialog(), new Event('close'));

      expect(auFermer).toHaveBeenCalledTimes(1);
    });

    it('est appelé au clic sur le voile (le dialog lui-même)', async () => {
      const auFermer = vi.fn();
      renderModale({ onClose: auFermer });

      await userEvent.click(dialog());

      expect(auFermer).toHaveBeenCalledTimes(1);
    });

    it("n'est pas appelé au clic dans le contenu", async () => {
      const auFermer = vi.fn();
      renderModale({ onClose: auFermer });

      await userEvent.click(screen.getByText('Annulation gratuite'));
      await userEvent.click(screen.getByRole('heading'));

      expect(auFermer).not.toHaveBeenCalled();
    });

    it("n'est pas appelé au clic sur un bouton d'action", async () => {
      const auFermer = vi.fn();
      const auClic = vi.fn();
      renderModale({ onClose: auFermer, actions: <button onClick={auClic}>OK</button> });

      await userEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(auClic).toHaveBeenCalledTimes(1);
      expect(auFermer).not.toHaveBeenCalled();
    });
  });

  describe('contenu', () => {
    it('a le style de modale', () => {
      renderModale();

      expect(dialog()).toHaveClass(styles.modale);
    });

    it('affiche le titre en h2 avec sa typo', () => {
      renderModale();

      const titre = screen.getByRole('heading', { level: 2, name: 'Annuler la réservation ?' });

      expect(titre).toHaveClass('typo-titre-2');
    });

    it('affiche les enfants', () => {
      renderModale();

      expect(screen.getByText('Annulation gratuite')).toBeInTheDocument();
    });

    it('regroupe tout dans le bloc contenu', () => {
      renderModale();

      const contenu = dialog().firstElementChild;

      expect(dialog().children).toHaveLength(1);
      expect(contenu).toHaveClass(styles.contenu);
      expect(contenu).toContainElement(screen.getByRole('heading'));
      expect(contenu).toContainElement(screen.getByText('Annulation gratuite'));
    });

    it("n'affiche rien avant le titre sans beforeTitle", () => {
      renderModale();

      expect(dialog().firstElementChild!.firstElementChild!.tagName).toBe('H2');
    });

    it('affiche beforeTitle juste avant le titre', () => {
      renderModale({ beforeTitle: <span>Décor</span> });

      const enfants = Array.from(dialog().firstElementChild!.children);

      expect(enfants[0]).toHaveTextContent('Décor');
      expect(enfants[1].tagName).toBe('H2');
    });
  });

  describe('actions', () => {
    it("n'affiche pas de zone actions sans actions", () => {
      renderModale();

      expect(dialog().querySelector(`.${styles.actions}`)).toBeNull();
    });

    it('affiche les actions dans la zone actions', () => {
      renderModale({
        actions: (
          <>
            <button>Garder ma place</button>
            <button>Annuler la réservation</button>
          </>
        ),
      });

      const zone = dialog().querySelector(`.${styles.actions}`);

      expect(zone).toBeInTheDocument();
      expect(zone).toContainElement(screen.getByRole('button', { name: 'Garder ma place' }));
      expect(zone).toContainElement(screen.getByRole('button', { name: 'Annuler la réservation' }));
    });

    it('place les actions après les enfants, en dernier', () => {
      renderModale({ actions: <button>OK</button> });

      const enfants = Array.from(dialog().firstElementChild!.children);
      const derniers = enfants.slice(-2);

      expect(derniers[0]).toHaveTextContent('Annulation gratuite');
      expect(derniers[1]).toHaveClass(styles.actions);
    });

    it('place beforeTitle, titre, enfants puis actions dans cet ordre', () => {
      renderModale({ beforeTitle: <span>Décor</span>, actions: <button>OK</button> });

      const enfants = Array.from(dialog().firstElementChild!.children);

      expect(enfants).toHaveLength(4);
      expect(enfants[0]).toHaveTextContent('Décor');
      expect(enfants[1].tagName).toBe('H2');
      expect(enfants[2]).toHaveTextContent('Annulation gratuite');
      expect(enfants[3]).toHaveClass(styles.actions);
    });
  });

  it("dans une page : s'ouvre, puis se ferme via un bouton d'action", async () => {
    function Page() {
      const [ouvert, setOuvert] = useState(false);
      return (
        <>
          <button onClick={() => setOuvert(true)}>Ouvrir</button>
          <Modale
            open={ouvert}
            onClose={() => setOuvert(false)}
            title="Annuler la réservation ?"
            actions={<button onClick={() => setOuvert(false)}>Garder ma place</button>}
          >
            <p>Annulation gratuite</p>
          </Modale>
        </>
      );
    }
    render(<Page />);

    expect(dialog()).not.toHaveAttribute('open');

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(dialog()).toHaveAttribute('open');

    await userEvent.click(screen.getByRole('button', { name: 'Garder ma place' }));
    expect(dialog()).not.toHaveAttribute('open');
  });
});
