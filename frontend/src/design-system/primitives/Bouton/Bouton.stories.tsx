import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bouton } from './Bouton';

const meta: Meta<typeof Bouton> = {
  title: 'primitives/Bouton',
  component: Bouton,
};
export default meta;

export const Principal: StoryObj<typeof Bouton> = {
  args: { children: 'Réserver' },
};
