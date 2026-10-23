import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LigneInfo } from './LigneInfo';
import styles from './LigneInfo.module.css';


function renderDansListe(ui: ReactNode) {
  return render(<dl>{ui}</dl>);
}

describe('LigneInfo', () => {
  it('affiche le libellé et la valeur', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    expect(screen.getByText('Buy-in')).toBeInTheDocument();
    expect(screen.getByText('200 CHF')).toBeInTheDocument();
  });

  it('rend le libellé dans un <dt>', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    expect(screen.getByRole('term')).toHaveTextContent('Buy-in');
  });

  it('rend la valeur dans un <dd>', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    expect(screen.getByRole('definition')).toHaveTextContent('200 CHF');
    expect(screen.getByText('200 CHF').tagName).toBe('DD');
  });

  it('place le libellé avant la valeur', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    const libelle = screen.getByText('Buy-in');
    const valeur = screen.getByText('200 CHF');

    expect(
      libelle.compareDocumentPosition(valeur) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('regroupe libellé et valeur dans le conteneur de ligne', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    const ligne = screen.getByText('Buy-in').parentElement;

    expect(ligne).toHaveClass(styles.ligne);
    expect(ligne).toContainElement(screen.getByText('200 CHF'));
  });

  it('applique le style et la typo du libellé', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    expect(screen.getByText('Buy-in')).toHaveClass(styles.libelle);
    expect(screen.getByText('Buy-in')).toHaveClass('typo-texte-petit');
  });

  it('applique le style et la typo de la valeur', () => {
    renderDansListe(<LigneInfo libelle="Buy-in" valeur="200 CHF" />);

    expect(screen.getByText('200 CHF')).toHaveClass(styles.valeur);
    expect(screen.getByText('200 CHF')).toHaveClass('typo-libelle');
  });

  it('accepte un nœud React comme valeur', () => {
    renderDansListe(
      <LigneInfo
        libelle="Casino"
        valeur={<a href="/casinos/montreux">Casino de Montreux</a>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Casino de Montreux' })).toHaveAttribute(
      'href',
      '/casinos/montreux',
    );
  });

  it('affiche plusieurs lignes indépendantes dans une même liste', () => {
    renderDansListe(
      <>
        <LigneInfo libelle="Casino" valeur="Casino de Montreux" />
        <LigneInfo libelle="Date" valeur="Ven. 16 oct. · 20:00" />
        <LigneInfo libelle="Buy-in" valeur="200 CHF" />
      </>,
    );

    expect(screen.getAllByRole('term')).toHaveLength(3);
    expect(screen.getAllByRole('definition')).toHaveLength(3);
  });
});
