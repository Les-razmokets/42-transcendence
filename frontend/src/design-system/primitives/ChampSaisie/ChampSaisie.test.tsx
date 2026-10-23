import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChampSaisie } from './ChampSaisie';
import styles from './ChampSaisie.module.css';

describe('ChampSaisie', () => {
  it('associe le libellé au champ', () => {
    render(<ChampSaisie libelle="Email" />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
  });

  it('applique le style de la saisie', () => {
    render(<ChampSaisie libelle="Email" />);

    expect(screen.getByLabelText('Email')).toHaveClass(styles.saisie);
  });

  it('permet de saisir du texte', async () => {
    render(<ChampSaisie libelle="Email" />);

    await userEvent.type(screen.getByLabelText('Email'), 'alice@floor.fr');

    expect(screen.getByLabelText('Email')).toHaveValue('alice@floor.fr');
  });

  it('appelle onChange à la saisie', async () => {
    const auChangement = vi.fn();
    render(<ChampSaisie libelle="Email" onChange={auChangement} />);

    await userEvent.type(screen.getByLabelText('Email'), 'abc');

    expect(auChangement).toHaveBeenCalledTimes(3);
  });

  it('transmet les attributs natifs au champ', () => {
    render(
      <ChampSaisie
        libelle="Mot de passe"
        type="password"
        placeholder="••••••••"
        name="motDePasse"
      />,
    );

    const champ = screen.getByLabelText('Mot de passe');
    expect(champ).toHaveAttribute('type', 'password');
    expect(champ).toHaveAttribute('placeholder', '••••••••');
    expect(champ).toHaveAttribute('name', 'motDePasse');
  });

  it('ajoute la className sans retirer la classe du conteneur', () => {
    const { container } = render(
      <ChampSaisie libelle="Email" className="ma-classe" />,
    );

    expect(container.firstChild).toHaveClass('ma-classe', styles.champ);
  });

  describe('identifiant', () => {
    it('utilise l’id fourni', () => {
      render(<ChampSaisie libelle="Email" id="mon-id" />);

      expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'mon-id');
    });

    it('génère un id automatique si aucun n’est fourni', () => {
      render(<ChampSaisie libelle="Email" />);

      expect(screen.getByLabelText('Email')).toHaveAttribute('id');
      expect(screen.getByLabelText('Email').id).not.toBe('');
    });

    it('génère des ids différents pour deux champs', () => {
      render(
        <>
          <ChampSaisie libelle="Prénom" />
          <ChampSaisie libelle="Nom" />
        </>,
      );

      expect(screen.getByLabelText('Prénom').id).not.toBe(
        screen.getByLabelText('Nom').id,
      );
    });
  });

  describe('sans message', () => {
    it("n'affiche aucun message", () => {
      const { container } = render(<ChampSaisie libelle="Email" />);

      expect(container.querySelector('p')).toBeNull();
    });

    it("n'a ni aria-describedby ni aria-invalid", () => {
      render(<ChampSaisie libelle="Email" />);

      expect(screen.getByLabelText('Email')).not.toHaveAttribute(
        'aria-describedby',
      );
      expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('avec aide', () => {
    it("affiche le texte d'aide", () => {
      render(<ChampSaisie libelle="Email" aide="Utilisez votre email pro" />);

      expect(screen.getByText('Utilisez votre email pro')).toBeInTheDocument();
    });

    it("applique le style d'aide", () => {
      render(<ChampSaisie libelle="Email" aide="Utilisez votre email pro" />);

      expect(screen.getByText('Utilisez votre email pro')).toHaveClass(
        styles.aide,
      );
    });

    it("relie l'aide au champ avec aria-describedby", () => {
      render(<ChampSaisie libelle="Email" aide="Utilisez votre email pro" />);

      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
        'Utilisez votre email pro',
      );
    });

    it("ne marque pas le champ comme invalide", () => {
      render(<ChampSaisie libelle="Email" aide="Utilisez votre email pro" />);

      expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('avec erreur', () => {
    it("affiche le message d'erreur", () => {
      render(<ChampSaisie libelle="Email" erreur="Email invalide" />);

      expect(screen.getByText('Email invalide')).toBeInTheDocument();
    });

    it("applique le style d'erreur", () => {
      render(<ChampSaisie libelle="Email" erreur="Email invalide" />);

      expect(screen.getByText('Email invalide')).toHaveClass(styles.erreur);
      expect(screen.getByText('Email invalide')).not.toHaveClass(styles.aide);
    });

    it('marque le champ comme invalide', () => {
      render(<ChampSaisie libelle="Email" erreur="Email invalide" />);

      expect(screen.getByLabelText('Email')).toBeInvalid();
      expect(screen.getByLabelText('Email')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it("relie l'erreur au champ avec aria-describedby", () => {
      render(<ChampSaisie libelle="Email" erreur="Email invalide" />);

      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
        'Email invalide',
      );
    });
  });

  describe('avec erreur et aide', () => {
    it("affiche l'erreur à la place de l'aide", () => {
      render(
        <ChampSaisie
          libelle="Email"
          aide="Utilisez votre email pro"
          erreur="Email invalide"
        />,
      );

      expect(screen.getByText('Email invalide')).toBeInTheDocument();
      expect(
        screen.queryByText('Utilisez votre email pro'),
      ).not.toBeInTheDocument();
    });
  });

  describe('désactivé', () => {
    it('désactive le champ', () => {
      render(<ChampSaisie libelle="Email" disabled />);

      expect(screen.getByLabelText('Email')).toBeDisabled();
    });

    it('ne permet pas de saisir du texte', async () => {
      render(<ChampSaisie libelle="Email" disabled />);

      await userEvent.type(screen.getByLabelText('Email'), 'abc');

      expect(screen.getByLabelText('Email')).toHaveValue('');
    });
  });
});
