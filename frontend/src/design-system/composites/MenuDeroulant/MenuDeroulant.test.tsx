import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MenuDeroulant } from './MenuDeroulant';
import styles from './MenuDeroulant.module.css';
import stylesFiltre from '../../primitives/Filtre/Filtre.module.css';

const casinos = ['Casino de Montreux', 'Grand Casino Bern', 'Casino Barrière Genève'];

// Le Filtre est toujours le premier bouton ; quand le panneau est ouvert,
// la 1re option porte le même nom que lui ("Tous les casinos")
function boutonFiltre() {
  return screen.getAllByRole('button')[0];
}

function panneau(container: HTMLElement) {
  return container.querySelector<HTMLElement>(`.${styles.panneau}`);
}

// Parent minimal qui garde la valeur dans un état, comme le fera une page
function MenuControle({ depart = null }: { depart?: string | null }) {
  const [valeur, setValeur] = useState<string | null>(depart);
  return (
    <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={valeur} onChange={setValeur} />
  );
}

describe('MenuDeroulant', () => {
  describe('fermé', () => {
    it('affiche le libellé sur le filtre quand aucune valeur', () => {
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />);

      expect(screen.getByRole('button', { name: 'Tous les casinos' })).toBeInTheDocument();
    });

    it('affiche la valeur choisie à la place du libellé', () => {
      render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur="Grand Casino Bern" onChange={() => {}} />,
      );

      expect(screen.getByRole('button', { name: 'Grand Casino Bern' })).toBeInTheDocument();
      expect(screen.queryByText('Tous les casinos')).toBeNull();
    });

    it("n'affiche pas le panneau au départ", () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      expect(panneau(container)).toBeNull();
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(boutonFiltre()).toHaveAttribute('aria-expanded', 'false');
    });

    it("le filtre n'est pas actif sans valeur", () => {
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />);

      expect(boutonFiltre()).not.toHaveClass(stylesFiltre.actif);
    });

    it('le filtre est actif quand une valeur est choisie', () => {
      render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur="Grand Casino Bern" onChange={() => {}} />,
      );

      expect(boutonFiltre()).toHaveClass(stylesFiltre.actif);
    });

    it('applique le style de zone au conteneur', () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      expect(container.firstChild).toHaveClass(styles.zone);
    });
  });

  describe('ouverture', () => {
    it('ouvre le panneau au clic sur le filtre', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());

      expect(panneau(container)).toBeInTheDocument();
      expect(boutonFiltre()).toHaveAttribute('aria-expanded', 'true');
    });

    it('affiche le libellé puis chaque option, dans cet ordre', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());

      const lignes = within(panneau(container)!).getAllByRole('button');

      expect(lignes.map((ligne) => ligne.textContent)).toEqual(['Tous les casinos', ...casinos]);
    });

    it("n'affiche que le libellé quand options est vide", async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={[]} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());

      const lignes = within(panneau(container)!).getAllByRole('button');

      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toHaveTextContent('Tous les casinos');
    });

    it('referme le panneau au second clic sur le filtre', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.click(boutonFiltre());

      expect(panneau(container)).toBeNull();
      expect(boutonFiltre()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('coche', () => {
    it('coche la ligne du libellé quand valeur vaut null', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());

      const lignes = within(panneau(container)!).getAllByRole('button');

      expect(lignes[0].querySelector('svg')).not.toBeNull();
      expect(panneau(container)!.querySelectorAll('svg')).toHaveLength(1);
    });

    it("coche seulement l'option égale à valeur", async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur="Grand Casino Bern" onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());

      const bern = within(panneau(container)!).getByRole('button', { name: 'Grand Casino Bern' });

      expect(bern.querySelector('svg')).not.toBeNull();
      expect(panneau(container)!.querySelectorAll('svg')).toHaveLength(1);
    });
  });

  describe('choix', () => {
    it("appelle onChange avec l'option cliquée", async () => {
      const auChangement = vi.fn();
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={auChangement} />);

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getByRole('button', { name: 'Grand Casino Bern' }));

      expect(auChangement).toHaveBeenCalledTimes(1);
      expect(auChangement).toHaveBeenCalledWith('Grand Casino Bern');
    });

    it('appelle onChange avec null au clic sur la ligne du libellé', async () => {
      const auChangement = vi.fn();
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur="Grand Casino Bern" onChange={auChangement} />,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.click(within(panneau(container)!).getByRole('button', { name: 'Tous les casinos' }));

      expect(auChangement).toHaveBeenCalledWith(null);
    });

    it('referme le panneau après un choix', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getByRole('button', { name: 'Grand Casino Bern' }));

      expect(panneau(container)).toBeNull();
    });

    it("n'appelle pas onChange à l'ouverture ni à la fermeture par le filtre", async () => {
      const auChangement = vi.fn();
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={auChangement} />);

      await userEvent.click(boutonFiltre());
      await userEvent.click(boutonFiltre());

      expect(auChangement).not.toHaveBeenCalled();
    });

    it('ne change pas la valeur affichée tout seul : valeur vient du parent', async () => {
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />);

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getByRole('button', { name: 'Grand Casino Bern' }));

      expect(boutonFiltre()).toHaveTextContent('Tous les casinos');
    });
  });

  describe('fermeture sans choix', () => {
    it('se ferme au clic en dehors, sans appeler onChange', async () => {
      const auChangement = vi.fn();
      const { container } = render(
        <div>
          <p>Ailleurs</p>
          <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={auChangement} />
        </div>,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getByText('Ailleurs'));

      expect(panneau(container)).toBeNull();
      expect(auChangement).not.toHaveBeenCalled();
    });

    it('reste ouvert au clic dans le panneau hors des options', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.click(panneau(container)!);

      expect(panneau(container)).toBeInTheDocument();
    });

    it('se ferme avec Échap, sans appeler onChange', async () => {
      const auChangement = vi.fn();
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={auChangement} />,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.keyboard('{Escape}');

      expect(panneau(container)).toBeNull();
      expect(auChangement).not.toHaveBeenCalled();
    });

    it('reste ouvert avec une autre touche', async () => {
      const { container } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());
      await userEvent.keyboard('a');

      expect(panneau(container)).toBeInTheDocument();
    });

    it('garde la valeur choisie après une fermeture par Échap', async () => {
      render(<MenuControle depart="Grand Casino Bern" />);

      await userEvent.click(boutonFiltre());
      await userEvent.keyboard('{Escape}');

      expect(boutonFiltre()).toHaveTextContent('Grand Casino Bern');
    });
  });

  describe('écouteurs sur document', () => {
    it("n'écoute pas document tant que le menu est fermé", () => {
      const ajout = vi.spyOn(document, 'addEventListener');
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />);

      const types = ajout.mock.calls.map(([type]) => type);

      expect(types).not.toContain('mousedown');
      ajout.mockRestore();
    });

    it('retire ses écouteurs à la fermeture', async () => {
      const retrait = vi.spyOn(document, 'removeEventListener');
      render(<MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />);

      await userEvent.click(boutonFiltre());
      retrait.mockClear();
      await userEvent.keyboard('{Escape}');

      const types = retrait.mock.calls.map(([type]) => type);

      expect(types).toContain('mousedown');
      expect(types).toContain('keydown');
      retrait.mockRestore();
    });

    it('retire ses écouteurs quand il disparaît alors qu’il est ouvert', async () => {
      const retrait = vi.spyOn(document, 'removeEventListener');
      const { unmount } = render(
        <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={null} onChange={() => {}} />,
      );

      await userEvent.click(boutonFiltre());
      retrait.mockClear();
      unmount();

      const types = retrait.mock.calls.map(([type]) => type);

      expect(types).toContain('mousedown');
      expect(types).toContain('keydown');
      retrait.mockRestore();
    });
  });

  describe('avec un parent qui garde la valeur', () => {
    it('affiche le choix sur le filtre puis revient au libellé', async () => {
      render(<MenuControle />);

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getByRole('button', { name: 'Casino de Montreux' }));

      expect(boutonFiltre()).toHaveTextContent('Casino de Montreux');
      expect(boutonFiltre()).toHaveClass(stylesFiltre.actif);

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getAllByRole('button', { name: 'Tous les casinos' })[0]);

      expect(boutonFiltre()).toHaveTextContent('Tous les casinos');
      expect(boutonFiltre()).not.toHaveClass(stylesFiltre.actif);
    });

    it('déplace la coche sur la nouvelle option à la réouverture', async () => {
      const { container } = render(<MenuControle />);

      await userEvent.click(boutonFiltre());
      await userEvent.click(screen.getByRole('button', { name: 'Casino Barrière Genève' }));
      await userEvent.click(boutonFiltre());

      const geneve = within(panneau(container)!).getByRole('button', { name: 'Casino Barrière Genève' });

      expect(geneve.querySelector('svg')).not.toBeNull();
      expect(panneau(container)!.querySelectorAll('svg')).toHaveLength(1);
    });

    it("ouvrir un menu ferme l'autre (clic en dehors)", async () => {
      const { container } = render(
        <div>
          <MenuControle />
          <MenuDeroulant libelle="Tous les jeux" options={['NLH', 'PLO']} valeur={null} onChange={() => {}} />
        </div>,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Tous les casinos' }));
      await userEvent.click(screen.getByRole('button', { name: 'Tous les jeux' }));

      const panneaux = container.querySelectorAll(`.${styles.panneau}`);

      expect(panneaux).toHaveLength(1);
      expect(within(panneaux[0] as HTMLElement).getByRole('button', { name: 'NLH' })).toBeInTheDocument();
    });
  });
});
