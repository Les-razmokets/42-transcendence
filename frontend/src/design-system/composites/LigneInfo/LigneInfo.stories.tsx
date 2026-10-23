import type { Meta, StoryObj } from '@storybook/react-vite';
import { LigneInfo } from './LigneInfo';

const meta: Meta<typeof LigneInfo> = {
  title: 'Affichage/LigneInfo',
  component: LigneInfo,
  args: { libelle: 'Buy-in', valeur: '200 CHF' },
  decorators: [
    (Story) => (
      <dl style={{ width: 600, margin: 0 }}>
        <Story />
      </dl>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LigneInfo>;

export const Simple: Story = {};

export const ValeurLongue: Story = {
  args: { libelle: 'Adresse', valeur: 'Rue du Théâtre 9, 1820 Montreux' },
};

export const Liste: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LigneInfo libelle="Casino" valeur="Casino de Montreux" />
      <LigneInfo libelle="Date" valeur="Ven. 16 oct. · 20:00" />
      <LigneInfo libelle="Buy-in" valeur="200 CHF" />
    </div>
  ),
};