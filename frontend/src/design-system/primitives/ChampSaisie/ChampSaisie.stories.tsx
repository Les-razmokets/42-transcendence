import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChampSaisie } from './ChampSaisie';

const meta: Meta<typeof ChampSaisie> = {
  title: 'Formulaires/ChampSaisie',
  component: ChampSaisie,
  args: {
    libelle: 'E-mail',
    type: 'email',
    placeholder: 'vous@exemple.ch',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ChampSaisie>;

export const Defaut: Story = {};

export const Rempli: Story = {
  args: { defaultValue: 'dusan@floor.ch' },
};

export const AvecAide: Story = {
  args: { libelle: 'Mot de passe', type: 'password', placeholder: '', aide: '8 caractères minimum' },
};

export const Erreur: Story = {
  args: { defaultValue: 'dusan@floor', erreur: 'Adresse e-mail invalide' },
};

export const Desactive: Story = {
  args: { defaultValue: 'dusan@floor.ch', disabled: true },
};

function ChampAvecValidation() {
  const [email, setEmail] = useState('');
  const invalide = email !== '' && !email.includes('@');

  return (
    <ChampSaisie
      libelle="E-mail"
      type="email"
      placeholder="vous@exemple.ch"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      erreur={invalide ? 'Il manque le @' : undefined}
    />
  );
}

export const AvecValidation: Story = {
  render: () => <ChampAvecValidation />,
};