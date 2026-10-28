import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MenuDeroulant } from './MenuDeroulant';

const meta: Meta<typeof MenuDeroulant> = {
  title: 'Actions/MenuDeroulant',
  component: MenuDeroulant,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ minHeight: 320 }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof MenuDeroulant>;

const casinos = ['Casino de Montreux', 'Grand Casino Bern', 'Casino Barrière Genève', 'Casino de Fribourg'];

function Demo() {
  const [valeur, setValeur] = useState<string | null>(null);
  return <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={valeur} onChange={setValeur} />;
}

export const Casinos: Story = { render: () => <Demo /> };

function BarreDemo() {
  const [casino, setCasino] = useState<string | null>(null);
  const [jeu, setJeu] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <MenuDeroulant libelle="Tous les casinos" options={casinos} valeur={casino} onChange={setCasino} />
      <MenuDeroulant libelle="Tous les jeux" options={['NLH', 'PLO']} valeur={jeu} onChange={setJeu} />
    </div>
  );
}

export const BarreDeFiltres: Story = { render: () => <BarreDemo /> };