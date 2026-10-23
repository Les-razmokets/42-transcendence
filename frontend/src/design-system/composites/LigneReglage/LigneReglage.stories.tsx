import type { Meta, StoryObj } from '@storybook/react-vite';
import { LigneReglage } from './LigneReglage';

const meta: Meta<typeof LigneReglage> = {
  title: 'Formulaires/LigneReglage',
  component: LigneReglage,
  args: {
    libelle: 'Rappel avant la partie',
    description: 'Une notification 2 h avant ta réservation.',
  },
  decorators: [(Story) => <div style={{ width: 720, maxWidth: '100%' }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof LigneReglage>;

export const Activee: Story = { args: { defaultChecked: true } };
export const Desactivee: Story = {};
export const SansDescription: Story = { args: { description: undefined } };
export const Indisponible: Story = { args: { defaultChecked: true, disabled: true } };

export const Notifications: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LigneReglage libelle="Rappel avant la partie" description="Une notification 2 h avant ta réservation." defaultChecked />
      <LigneReglage libelle="Place libérée" description="Une place se libère à une table que tu suis." defaultChecked />
      <LigneReglage libelle="Offres des casinos" description="Tournois et événements des casinos partenaires." />
      <LigneReglage libelle="Récapitulatif par e-mail" description="Tes réservations de la semaine, chaque lundi." defaultChecked />
    </div>
  ),
};