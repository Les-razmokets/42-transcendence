import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { LigneMenu } from './LigneMenu';

const meta: Meta<typeof LigneMenu> = {
  title: 'Navigation/LigneMenu',
  component: LigneMenu,
  args: { libelle: 'Mes réservations', icone: 'ticket', link: '/compte' },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/compte/parametres']}>
        <div style={{ width: 320 }}><Story /></div>
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LigneMenu>;

export const Defaut: Story = {};

export const Active: Story = {
  args: { libelle: 'Paramètres', icone: 'reglages', link: '/compte/parametres' },
};

export const Danger: Story = {
  args: { libelle: 'Se déconnecter', icone: 'sortie', link: undefined, danger: true, chevron: false, onClick: () => {} },
};

export const MenuCompte: Story = {
  render: () => (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <LigneMenu libelle="Mes réservations" icone="ticket" link="/" />
      <LigneMenu libelle="Informations personnelles" icone="profil" link="/compte/infos" />
      <LigneMenu libelle="Moyens de paiement" icone="carte" link="/compte/paiement" />
      <LigneMenu libelle="Paramètres" icone="reglages" link="/compte/parametres" />
      <LigneMenu libelle="Se déconnecter" icone="sortie" danger chevron={false} onClick={() => {}} />
    </nav>
  ),
};