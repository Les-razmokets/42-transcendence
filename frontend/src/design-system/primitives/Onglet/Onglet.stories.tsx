import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Onglet } from './Onglet';

const meta: Meta<typeof Onglet> = {
  title: 'primitives/Onglet',
  component: Onglet,
  args: { children: "à venir", onClick: fn()}
};
export default meta;
type Story = StoryObj<typeof Onglet>;

export const Actif: Story = {
    args: { actif: true },
}

export const Inactif: Story = {
    args: { actif: false, children: "passée"}
}

export const Groupe: Story = {
    render: () => (
        <div role='tablist' aria-label='Mes trucs' style={{display: 'flex', gap: 24}}>
            <Onglet actif>A venir</Onglet>
            <Onglet>Passée</Onglet>
        </div>
    )
}
