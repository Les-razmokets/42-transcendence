import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { CarteTable } from './CarteTable';
import { VueTable } from './VueTable';
import { Chaise, type EtatChaise } from './Chaise';
import styles from './CarteTable.module.css';

const troisLibres: EtatChaise[] = [
  'libre', 'occupee', 'libre', 'occupee', 'occupee', 'libre', 'occupee', 'occupee', 'occupee',
];
const pleine: EtatChaise[] = Array(9).fill('occupee');

// Link a besoin d'un routeur
function renderAvecRouteur(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// Les images sont décoratives (alt="") : elles n'ont pas de rôle accessible, on passe par le DOM
function chaises(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLImageElement>(`img.${styles.chaise}`));
}

function estLibre(img: HTMLImageElement) {
  return img.getAttribute('src')!.includes('chaise_creme');
}

describe('Chaise', () => {
  it("affiche l'image crème quand elle est libre", () => {
    const { container } = render(<Chaise etat="libre" />);

    expect(container.querySelector('img')!.getAttribute('src')).toContain('chaise_creme');
  });

  it("affiche l'image occupée quand elle est occupée", () => {
    const { container } = render(<Chaise etat="occupee" />);

    expect(container.querySelector('img')!.getAttribute('src')).toContain('chaise_occupee');
  });

  it('est décorative, non déplaçable et stylée', () => {
    const { container } = render(<Chaise etat="libre" />);
    const img = container.querySelector('img');

    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('draggable', 'false');
    expect(img).toHaveClass(styles.chaise);
  });
});

describe('VueTable', () => {
  it("affiche l'image de la table, décorative", () => {
    const { container } = render(<VueTable places={troisLibres} />);
    const table = container.querySelector(`img.${styles.imageTable}`);

    expect(table!.getAttribute('src')).toContain('table_seule');
    expect(table).toHaveAttribute('alt', '');
    expect(table).toHaveAttribute('draggable', 'false');
  });

  it('place toujours 9 chaises', () => {
    const { container } = render(<VueTable places={troisLibres} />);

    expect(container.querySelectorAll(`.${styles.place}`)).toHaveLength(9);
    expect(chaises(container)).toHaveLength(9);
  });

  it("respecte l'état de chaque place, dans l'ordre", () => {
    const { container } = render(<VueTable places={troisLibres} />);

    expect(chaises(container).map((c) => (estLibre(c) ? 'libre' : 'occupee'))).toEqual(troisLibres);
  });

  it('complète les places manquantes en libre', () => {
    const { container } = render(<VueTable places={['occupee', 'occupee']} />);

    const etats = chaises(container).map((c) => (estLibre(c) ? 'libre' : 'occupee'));

    expect(etats).toHaveLength(9);
    expect(etats.slice(0, 2)).toEqual(['occupee', 'occupee']);
    expect(etats.slice(2).every((e) => e === 'libre')).toBe(true);
  });

  it('ignore les places au-delà de 9', () => {
    const { container } = render(<VueTable places={[...pleine, 'libre', 'libre']} />);

    expect(chaises(container)).toHaveLength(9);
    expect(chaises(container).some(estLibre)).toBe(false);
  });

  it('positionne chaque place en pourcentage, centrée et tournée', () => {
    const { container } = render(<VueTable places={troisLibres} />);
    const premiere = container.querySelector<HTMLElement>(`.${styles.place}`)!;

    expect(premiere.style.left).toBe('72.84%');
    expect(premiere.style.top).toBe('85.14%');
    expect(premiere.style.transform).toBe('translate(-50%, -50%) rotate(159.1deg)');
  });

  it('donne une position différente à chaque place', () => {
    const { container } = render(<VueTable places={troisLibres} />);

    const positions = Array.from(container.querySelectorAll<HTMLElement>(`.${styles.place}`)).map(
      (p) => `${p.style.left},${p.style.top}`,
    );

    expect(new Set(positions).size).toBe(9);
  });

  it("met l'image de la table avant les chaises, dans la vue", () => {
    const { container } = render(<VueTable places={troisLibres} />);
    const vue = container.firstElementChild!;

    expect(vue).toHaveClass(styles.vue);
    expect(vue.firstElementChild).toHaveClass(styles.imageTable);
  });
});

describe('CarteTable', () => {
  describe('contenu', () => {
    it('affiche le casino en titre 3', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00 · NLH 1/2" places={troisLibres} link="/tables/4" />,
      );

      expect(screen.getByText('Casino de Montreux')).toHaveClass('typo-titre-3');
    });

    it('affiche les détails en style secondaire', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00 · NLH 1/2" places={troisLibres} link="/tables/4" />,
      );

      expect(screen.getByText('20:00 · NLH 1/2')).toHaveClass(styles.details);
      expect(screen.getByText('20:00 · NLH 1/2')).toHaveClass('typo-texte-petit');
    });

    it('place la table, le casino puis les détails dans cet ordre', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00 · NLH 1/2" places={troisLibres} link="/tables/4" />,
      );

      const enfants = Array.from(screen.getByRole('link').children);

      expect(enfants).toHaveLength(3);
      expect(enfants[0]).toHaveClass(styles.cadreTable);
      expect(enfants[0].firstElementChild).toHaveClass(styles.vue);
      expect(enfants[1]).toHaveTextContent('Casino de Montreux');
      expect(enfants[2]).toHaveTextContent('20:00 · NLH 1/2');
    });

    it('transmet les places à la vue de la table', () => {
      const { container } = renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00" places={troisLibres} link="/tables/4" />,
      );

      expect(chaises(container).filter(estLibre)).toHaveLength(3);
    });
  });

  describe('avec des places libres : lien', () => {
    it('rend un lien vers la table', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00" places={troisLibres} link="/tables/4" />,
      );

      expect(screen.getByRole('link')).toHaveAttribute('href', '/tables/4');
    });

    it('a pour nom accessible le casino et les détails', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00" places={troisLibres} link="/tables/4" />,
      );

      expect(screen.getByRole('link')).toHaveAccessibleName(/Casino de Montreux/);
      expect(screen.getByRole('link')).toHaveAccessibleName(/20:00/);
    });

    it('a le style de carte, sans le style complète', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="20:00" places={troisLibres} link="/tables/4" />,
      );

      expect(screen.getByRole('link')).toHaveClass(styles.carte);
      expect(screen.getByRole('link')).not.toHaveClass(styles.complete);
    });

    it("est un lien dès qu'une seule place est libre", () => {
      renderAvecRouteur(
        <CarteTable
          casino="Casino de Montreux"
          details="20:00"
          places={[...Array(8).fill('occupee'), 'libre']}
          link="/tables/4"
        />,
      );

      expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('navigue vers la table au clic', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={<CarteTable casino="Casino de Montreux" details="20:00" places={troisLibres} link="/tables/4" />}
            />
            <Route path="/tables/4" element={<p>Page table 4</p>} />
          </Routes>
        </MemoryRouter>,
      );

      await userEvent.click(screen.getByRole('link'));

      expect(screen.getByText('Page table 4')).toBeInTheDocument();
    });
  });

  describe('table complète', () => {
    it("n'est pas un lien", () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="Complète" places={pleine} link="/tables/4" />,
      );

      expect(screen.queryByRole('link')).toBeNull();
    });

    it('a le style de carte et le style complète', () => {
      renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="Complète" places={pleine} link="/tables/4" />,
      );

      const carte = screen.getByText('Casino de Montreux').parentElement;

      expect(carte!.tagName).toBe('DIV');
      expect(carte).toHaveClass(styles.carte);
      expect(carte).toHaveClass(styles.complete);
    });

    it('garde le même contenu', () => {
      const { container } = renderAvecRouteur(
        <CarteTable casino="Casino de Montreux" details="Complète" places={pleine} link="/tables/4" />,
      );

      expect(screen.getByText('Casino de Montreux')).toBeInTheDocument();
      expect(screen.getByText('Complète')).toBeInTheDocument();
      expect(chaises(container)).toHaveLength(9);
      expect(chaises(container).some(estLibre)).toBe(false);
    });

    it('ne navigue pas au clic', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={<CarteTable casino="Casino de Montreux" details="Complète" places={pleine} link="/tables/4" />}
            />
            <Route path="/tables/4" element={<p>Page table 4</p>} />
          </Routes>
        </MemoryRouter>,
      );

      await userEvent.click(screen.getByText('Casino de Montreux'));

      expect(screen.queryByText('Page table 4')).toBeNull();
    });
  });

  it('dans un lobby, seules les tables avec des places sont des liens', () => {
    renderAvecRouteur(
      <div>
        <CarteTable casino="Casino de Montreux" details="3 libres" places={troisLibres} link="/tables/4" />
        <CarteTable casino="Casino Barrière Genève" details="Complète" places={pleine} link="/tables/2" />
      </div>,
    );

    const liens = screen.getAllByRole('link');

    expect(liens).toHaveLength(1);
    expect(liens[0]).toHaveAttribute('href', '/tables/4');
  });
});
