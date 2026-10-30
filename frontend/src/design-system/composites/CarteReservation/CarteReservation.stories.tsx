import type { Meta, StoryObj } from '@storybook/react-vite';
import { CarteReservation } from './CarteReservation';

const meta: Meta<typeof CarteReservation> = {
  title: 'Affichage/CarteReservation',
  component: CarteReservation,
  args: {
    casino: 'Casino de Montreux',
    date: 'Ven. 16 oct. · 20:00',
    table: 'Table 4 · Place 5 · NLH 1/2',
    buyIn: 'Buy-in payé : 200 CHF',
    reference: 'FLR-1610-0042',
    libelleQr: 'QR code de la réservation FLR-1610-0042',
    status: 'a-venir',
    libelleAfficheQr: 'Afficher le QR',
    libelleAnnuler: 'Annuler',
    onAfficherQr: () => {},
    onAnnuler: () => {},
  },
  decorators: [(Story) => <div style={{ width: 880, maxWidth: '100%' }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof CarteReservation>;

export const AVenir: Story = {};

export const Passee: Story = {
  args: { status: 'passee' },
};