import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { CarteTable } from './CarteTable';
import type { EtatChaise } from './Chaise';

const troisLibres: EtatChaise[] = [
  'libre', 'occupee', 'libre', 'occupee', 'occupee', 'libre', 'occupee', 'occupee', 'occupee',
];
const presqueVide: EtatChaise[] = [
  'libre', 'libre', 'libre', 'occupee', 'libre', 'libre', 'libre', 'libre', 'occupee',
];
const pleine: EtatChaise[] = Array(9).fill('occupee');

const meta: Meta<typeof CarteTable> = {
  title: 'Affichage/CarteTable',
  component: CarteTable,
  args: {
    casino: 'Casino de Montreux',
    details: '20:00 · NLH 1/2 · 3 libres',
    places: troisLibres,
    link: '/tables/4',
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ width: 344 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof CarteTable>;

export const AvecPlaces: Story = {};

export const Complete: Story = {
  args: {
    details: '20:00 · NLH 1/2 · Complète',
    places: pleine,
  },
};

export const Lobby: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 'min(1100px, 90vw)' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 24,
      }}
    >
      <CarteTable casino="Casino de Montreux" details="20:00 · NLH 1/2 · 3 libres" places={troisLibres} link="/tables/4" />
      <CarteTable casino="Grand Casino Bern" details="21:00 · NLH 2/5 · 7 libres" places={presqueVide} link="/tables/7" />
      <CarteTable casino="Casino Barrière Genève" details="19:30 · PLO 1/2 · Complète" places={pleine} link="/tables/2" />
    </div>
  ),
};