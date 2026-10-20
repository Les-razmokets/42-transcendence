import type { Meta, StoryObj } from '@storybook/react-vite';
import { Notification } from './Notification';

const meta: Meta<typeof Notification> = {
  title: 'Affichage/Notification',
  component: Notification,
  args: { children: 'Modifications enregistrées' }
};
export default meta;
type Story = StoryObj<typeof Notification>;

export const Succes: Story = {};

export const Erreur: Story = {
  args: { variante: 'erreur', children: 'Paiement refusé, réessaie' },
};

export const TexteLong: Story = {
  args: {
    children:
      'Réservation annulée. Les 200 CHF seront remboursés sur ta carte Visa •••• 4242 sous 3 à 5 jours ouvrables.',
  },
};

export const LesDeux: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <Notification>Modifications enregistrées</Notification>
      <Notification variante="erreur">Paiement refusé, réessaie</Notification>
    </div>
  ),
};