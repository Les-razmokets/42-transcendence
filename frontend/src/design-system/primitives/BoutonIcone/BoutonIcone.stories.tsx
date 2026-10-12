import type { Meta, StoryObj} from '@storybook/react-vite';
import { BoutonIcone} from './BoutonIcone.tsx';


const meta: Meta<typeof BoutonIcone> = {
  title: 'primitives/BoutonIcone',
  component: BoutonIcone,
};
export default meta;

export const Principal: StoryObj<typeof BoutonIcone> = {
  args: {  },
};
