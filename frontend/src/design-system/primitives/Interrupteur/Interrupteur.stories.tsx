import type { Meta, StoryObj } from '@storybook/react-vite';
import { Interrupteur } from './Interrupteur';

const meta: Meta<typeof Interrupteur> = {
  title: 'Formulaires/Interrupteur',
  component: Interrupteur,
  args: { 'aria-label': 'Rappel avant la partie' },
};
export default meta;
type Story = StoryObj<typeof Interrupteur>;

export const Active: Story = { args: { defaultChecked: true } };
export const Desactive: Story = { args: { defaultChecked: false } };
export const Indisponible: Story = { args: { defaultChecked: true, disabled: true } };