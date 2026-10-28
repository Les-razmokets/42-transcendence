import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { OptionMenu } from './OptionMenu';
import styles from './OptionMenu.module.css';

// Parent minimal : garde l'option choisie dans un état, comme le fera MenuDeroulant
function ListeCasinos() {
  const casinos = ['Tous les casinos', 'Casino de Montreux', 'Grand Casino Bern'];
  const [choisi, setChoisi] = useState(casinos[0]);

  return (
    <div>
      {casinos.map((casino) => (
        <OptionMenu key={casino} selected={choisi === casino} onClick={() => setChoisi(casino)}>
          {casino}
        </OptionMenu>
      ))}
    </div>
  );
}

describe('OptionMenu', () => {
  describe('contenu', () => {
    it('est un bouton accessible par son libellé', () => {
      render(<OptionMenu>Casino de Montreux</OptionMenu>);

      expect(screen.getByRole('button', { name: 'Casino de Montreux' })).toBeInTheDocument();
    });

    it('affiche le libellé dans un <span> avec son style et sa typo', () => {
      render(<OptionMenu>Casino de Montreux</OptionMenu>);

      const libelle = screen.getByText('Casino de Montreux');

      expect(libelle.tagName.toLowerCase()).toBe('span');
      expect(libelle).toHaveClass(styles.libelle);
      expect(libelle).toHaveClass('typo-texte-petit');
    });

    it('accepte du JSX comme children', () => {
      render(
        <OptionMenu>
          <strong>Casino</strong> de Montreux
        </OptionMenu>,
      );

      expect(screen.getByText('Casino').tagName.toLowerCase()).toBe('strong');
      expect(screen.getByRole('button', { name: 'Casino de Montreux' })).toBeInTheDocument();
    });
  });

  describe('selected', () => {
    it("n'affiche pas de coche par défaut", () => {
      const { container } = render(<OptionMenu>Casino de Montreux</OptionMenu>);

      expect(container.querySelector('svg')).toBeNull();
    });

    it("n'affiche pas de coche avec selected={false}", () => {
      const { container } = render(<OptionMenu selected={false}>Casino de Montreux</OptionMenu>);

      expect(container.querySelector('svg')).toBeNull();
    });

    it('affiche la coche en 16px quand selected', () => {
      const { container } = render(<OptionMenu selected>Casino de Montreux</OptionMenu>);

      expect(container.querySelector('svg')).toHaveAttribute('width', '16');
    });

    it('cache la coche décorative : le nom vient du libellé seul', () => {
      const { container } = render(<OptionMenu selected>Casino de Montreux</OptionMenu>);

      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByRole('button', { name: 'Casino de Montreux' })).toBeInTheDocument();
    });

    it('place le libellé puis la coche dans cet ordre', () => {
      render(<OptionMenu selected>Casino de Montreux</OptionMenu>);

      const enfants = Array.from(screen.getByRole('button').children);

      expect(enfants).toHaveLength(2);
      expect(enfants[0]).toHaveTextContent('Casino de Montreux');
      expect(enfants[1].tagName.toLowerCase()).toBe('svg');
    });

    it("ne transmet pas selected au <button>", () => {
      render(<OptionMenu selected>Casino de Montreux</OptionMenu>);

      expect(screen.getByRole('button')).not.toHaveAttribute('selected');
    });
  });

  describe('props du bouton', () => {
    it('applique le style option', () => {
      render(<OptionMenu>Casino de Montreux</OptionMenu>);

      expect(screen.getByRole('button')).toHaveClass(styles.option);
    });

    it('ajoute className sans écraser le style option', () => {
      render(<OptionMenu className="perso">Casino de Montreux</OptionMenu>);

      expect(screen.getByRole('button')).toHaveClass(styles.option);
      expect(screen.getByRole('button')).toHaveClass('perso');
    });

    it("n'ajoute pas \"undefined\" dans les classes sans className", () => {
      render(<OptionMenu>Casino de Montreux</OptionMenu>);

      expect(screen.getByRole('button').className).not.toContain('undefined');
    });

    it('est toujours de type button, même si on passe type="submit"', () => {
      render(<OptionMenu type="submit">Casino de Montreux</OptionMenu>);

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('transmet les autres props au <button>', () => {
      render(
        <OptionMenu id="opt-montreux" aria-label="Montreux" data-valeur="montreux">
          Casino de Montreux
        </OptionMenu>,
      );

      const bouton = screen.getByRole('button', { name: 'Montreux' });

      expect(bouton).toHaveAttribute('id', 'opt-montreux');
      expect(bouton).toHaveAttribute('data-valeur', 'montreux');
    });
  });

  describe('clic', () => {
    it('appelle onClick au clic', async () => {
      const auClic = vi.fn();
      render(<OptionMenu onClick={auClic}>Casino de Montreux</OptionMenu>);

      await userEvent.click(screen.getByRole('button'));

      expect(auClic).toHaveBeenCalledTimes(1);
    });

    it('appelle onClick au clic sur le libellé', async () => {
      const auClic = vi.fn();
      render(<OptionMenu onClick={auClic}>Casino de Montreux</OptionMenu>);

      await userEvent.click(screen.getByText('Casino de Montreux'));

      expect(auClic).toHaveBeenCalledTimes(1);
    });

    it('se déclenche au clavier avec Entrée et Espace', async () => {
      const auClic = vi.fn();
      render(<OptionMenu onClick={auClic}>Casino de Montreux</OptionMenu>);

      await userEvent.tab();
      expect(screen.getByRole('button')).toHaveFocus();

      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard(' ');

      expect(auClic).toHaveBeenCalledTimes(2);
    });

    it("n'appelle pas onClick quand il est désactivé", async () => {
      const auClic = vi.fn();
      render(
        <OptionMenu disabled onClick={auClic}>
          Casino de Montreux
        </OptionMenu>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(auClic).not.toHaveBeenCalled();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('ne soumet pas le formulaire qui le contient', async () => {
      const auSubmit = vi.fn((e: SubmitEvent) => e.preventDefault());
      render(
        <form onSubmit={(e) => auSubmit(e.nativeEvent as SubmitEvent)}>
          <OptionMenu>Casino de Montreux</OptionMenu>
        </form>,
      );

      await userEvent.click(screen.getByRole('button'));

      expect(auSubmit).not.toHaveBeenCalled();
    });

    it('ne se sélectionne pas tout seul : selected vient du parent', async () => {
      const { container } = render(<OptionMenu onClick={() => {}}>Casino de Montreux</OptionMenu>);

      await userEvent.click(screen.getByRole('button'));

      expect(container.querySelector('svg')).toBeNull();
    });
  });

  describe('dans une liste pilotée par un parent', () => {
    it('coche seulement la première option au départ', () => {
      const { container } = render(<ListeCasinos />);

      const coches = container.querySelectorAll('svg');

      expect(coches).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Tous les casinos' })).toContainElement(coches[0]);
    });

    it("déplace la coche sur l'option cliquée", async () => {
      const { container } = render(<ListeCasinos />);

      await userEvent.click(screen.getByRole('button', { name: 'Casino de Montreux' }));

      const coches = container.querySelectorAll('svg');

      expect(coches).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Casino de Montreux' })).toContainElement(coches[0]);
      expect(screen.getByRole('button', { name: 'Tous les casinos' }).querySelector('svg')).toBeNull();
    });

    it('garde la coche si on reclique sur la même option', async () => {
      render(<ListeCasinos />);

      const montreux = screen.getByRole('button', { name: 'Casino de Montreux' });
      await userEvent.click(montreux);
      await userEvent.click(montreux);

      expect(montreux.querySelector('svg')).not.toBeNull();
    });
  });
});
