import type { Meta, StoryObj } from '@storybook/react-vite';
import { Filtre } from './Filtre';

const meta: Meta<typeof Filtre> = {
  title: 'primitives/Filtre',
  component: Filtre,
};
export default meta;

export const Principal: StoryObj<typeof Filtre> = {
  args: { children: 'Casino' },
};