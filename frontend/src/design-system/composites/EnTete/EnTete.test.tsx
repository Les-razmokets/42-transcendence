import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { EnTeteLobby, EnTeteTable } from './index';
import styles from './EnTete.module.css';

// <Link> a besoin d'un routeur : on rend l'en-tête sur "/" et une page factice sur "/compte"
function renderAvecRouteur(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/compte" element={<p>Page compte</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const propsTable = {
  userName: 'Dusan Fama',
  libelleAccount: 'Mon compte',
  titre: 'Casino de Montreux',
  details: '20:00 · NLH 1/2',
  libelleReturn: 'Retour au lobby',
};

describe('EnTete (base commune)', () => {
  it('est un <header> (landmark banner)', () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    expect(screen.getByRole('banner')).toHaveClass(styles.enTete);
  });

  it('affiche un lien vers /compte nommé par libelleAccount', () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveAttribute('href', '/compte');
  });

  it("le nom du lien vient de libelleAccount, pas des initiales de l'avatar", () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    expect(screen.queryByRole('link', { name: 'DF' })).toBeNull();
  });

  it("affiche les initiales de l'utilisateur dans le lien", () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveTextContent('DF');
  });

  it('navigue vers la page compte au clic sur l’avatar', async () => {
    const user = userEvent.setup();
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    await user.click(screen.getByRole('link', { name: 'Mon compte' }));

    expect(screen.getByText('Page compte')).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('place les bandes décoratives sous la barre', () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    const header = screen.getByRole('banner');
    const [barre, bandes] = Array.from(header.children);

    expect(header.children).toHaveLength(2);
    expect(barre).toHaveClass(styles.barre);
    expect(bandes).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EnTeteLobby', () => {
  it('affiche le logo en deux variantes (mobile m et desktop l)', () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    const logos = screen.getAllByText('FLOOR');

    expect(logos).toHaveLength(2);
    expect(logos[0].parentElement).toHaveClass(styles.mobile);
    expect(logos[0]).toHaveClass('typo-logo-m');
    expect(logos[1].parentElement).toHaveClass(styles.desktop);
    expect(logos[1]).toHaveClass('typo-logo-l');
  });

  it("n'affiche ni bouton retour ni bloc d'infos", () => {
    const { container } = renderAvecRouteur(
      <EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector(`.${styles.infos}`)).toBeNull();
  });

  it('ordonne la barre : logos, puis lien compte', () => {
    renderAvecRouteur(<EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />);

    const barre = screen.getByRole('banner').querySelector(`.${styles.barre}`)!;
    const enfants = Array.from(barre.children);

    expect(enfants).toHaveLength(3);
    expect(enfants[0]).toHaveClass(styles.mobile);
    expect(enfants[1]).toHaveClass(styles.desktop);
    expect(enfants[2]).toBe(screen.getByRole('link', { name: 'Mon compte' }));
  });
});

describe('EnTeteTable', () => {
  it('affiche un bouton retour nommé par libelleReturn', () => {
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={() => {}} />);

    expect(screen.getByRole('button', { name: 'Retour au lobby' })).toBeInTheDocument();
  });

  it('appelle onRetour une fois au clic', async () => {
    const user = userEvent.setup();
    const onRetour = vi.fn();
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={onRetour} />);

    await user.click(screen.getByRole('button', { name: 'Retour au lobby' }));

    expect(onRetour).toHaveBeenCalledTimes(1);
  });

  it('appelle onRetour au clavier (Entrée et Espace)', async () => {
    const user = userEvent.setup();
    const onRetour = vi.fn();
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={onRetour} />);

    screen.getByRole('button', { name: 'Retour au lobby' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onRetour).toHaveBeenCalledTimes(2);
  });

  it('affiche le titre et les détails avec leurs styles', () => {
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={() => {}} />);

    const titre = screen.getByText('Casino de Montreux');
    const details = screen.getByText('20:00 · NLH 1/2');

    expect(titre).toHaveClass(styles.titre);
    expect(details).toHaveClass(styles.details);
    expect(details).toHaveClass('typo-legende');
    expect(titre.parentElement).toHaveClass(styles.infos);
    expect(details.parentElement).toBe(titre.parentElement);
  });

  it("n'affiche pas le logo", () => {
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={() => {}} />);

    expect(screen.queryByText('FLOOR')).toBeNull();
  });

  it('garde le lien compte (props transmises à la base)', () => {
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={() => {}} />);

    const lien = screen.getByRole('link', { name: 'Mon compte' });

    expect(lien).toHaveAttribute('href', '/compte');
    expect(lien).toHaveTextContent('DF');
  });

  it('ordonne la barre : retour, infos, lien compte', () => {
    renderAvecRouteur(<EnTeteTable {...propsTable} onRetour={() => {}} />);

    const barre = screen.getByRole('banner').querySelector(`.${styles.barre}`)!;
    const enfants = Array.from(barre.children);

    expect(enfants).toHaveLength(3);
    expect(enfants[0]).toBe(screen.getByRole('button', { name: 'Retour au lobby' }));
    expect(enfants[1]).toHaveClass(styles.infos);
    expect(enfants[2]).toBe(screen.getByRole('link', { name: 'Mon compte' }));
  });
});
