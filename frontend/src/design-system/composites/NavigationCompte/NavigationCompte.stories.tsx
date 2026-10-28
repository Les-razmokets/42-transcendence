import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { NavigationCompte } from './NavigationCompte';

const liens = [
  { libelle: 'Mes réservations', icone: 'ticket', link: '/compte' },
  { libelle: 'Informations personnelles', icone: 'profil', link: '/compte/infos' },
  { libelle: 'Moyens de paiement', icone: 'carte', link: '/compte/paiement' },
  { libelle: 'Paramètres', icone: 'reglages', link: '/compte/parametres' },
] as const;

const meta: Meta<typeof NavigationCompte> = {
  title: 'Navigation/NavigationCompte',
  component: NavigationCompte,
  args: {
    nom: 'Dusan Fama',
    email: 'dusan@floor.ch',
    points: '1 240',
    libellePoints: 'Points fidélité',
    liens: [...liens],
    libelleDeconnexion: 'Se déconnecter',
    onDeconnexion: () => {},
  },
  decorators: [(Story) => <div style={{ width: 400 }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof NavigationCompte>;

function avecAdresse(adresse: string): Story['decorators'] {
  return [(Story) => <MemoryRouter initialEntries={[adresse]}><Story /></MemoryRouter>];
}

export const Reservations: Story = { decorators: avecAdresse('/compte') };
export const Informations: Story = { decorators: avecAdresse('/compte/infos') };
export const Paiement: Story = { decorators: avecAdresse('/compte/paiement') };
export const Parametres: Story = { decorators: avecAdresse('/compte/parametres') };