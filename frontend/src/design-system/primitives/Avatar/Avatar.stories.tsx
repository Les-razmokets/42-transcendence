import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'primitives/Avatar',
  component: Avatar,
};
export default meta;

export const Principal: StoryObj<typeof Avatar> = {
  args: { nom : "Dusan Fama", taille: 'm'},
};

export const Secondaire: StoryObj<typeof Avatar> = {
    args: { nom: "Jean Benoit Jacques", taille: 'l'}
}
