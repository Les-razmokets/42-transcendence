import type { Meta, StoryObj} from '@storybook/react-vite';
import { Bandes } from './Bandes';

const meta: Meta<typeof Bandes> = {
  title: 'primitives/Bandes',
  component: Bandes,
};
export default meta;

export const Principal: StoryObj<typeof Bandes> = {
  args: {},
};