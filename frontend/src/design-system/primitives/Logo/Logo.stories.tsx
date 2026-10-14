import type { Meta, StoryObj} from '@storybook/react-vite';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = {
  title: 'primitives/Logo',
  component: Logo,
};
export default meta;

export const Principal: StoryObj<typeof Logo> = {
  args: {},
};