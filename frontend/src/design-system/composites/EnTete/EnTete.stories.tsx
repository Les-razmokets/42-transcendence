import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { EnTeteLobby } from './EnTeteLobby';
import { EnTeteTable } from './EnTeteTable';

const meta: Meta = {
  title: 'Navigation/EnTete',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Lobby: Story = {
  render: () => <EnTeteLobby userName="Dusan Fama" libelleAccount="Mon compte" />,
};

export const Table: Story = {
  render: () => (
    <EnTeteTable
      userName="Dusan Fama"
      libelleAccount="Mon compte"
      titre="Casino de Montreux"
      details="20:00 · NLH 1/2"
      libelleReturn="Retour au lobby"
      onRetour={() => {}}
    />
  ),
};