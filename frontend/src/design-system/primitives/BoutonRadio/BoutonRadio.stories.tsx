import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoutonRadio } from './BoutonRadio';

const meta: Meta<typeof BoutonRadio> = {
  title: 'primitives/BoutonRadio',
  component: BoutonRadio,
};
export default meta;

export const Principal: StoryObj<typeof BoutonRadio> = {
  args: { name: 'demo', checked: true },
};
