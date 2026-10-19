import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'primitives/Badge',
  component: Badge,
};
export default meta;

export const Alerte: StoryObj<typeof Badge> = {
  args: { variante: 'alerte', children: "Alerte"},
};

export const Info: StoryObj<typeof Badge> = {
  args: { variante: 'info', children: "Info"},
};

export const Neutre: StoryObj<typeof Badge> = {
  args: { variante: 'neutre', children: "Neutre"},
};