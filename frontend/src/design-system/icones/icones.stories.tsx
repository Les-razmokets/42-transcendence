import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icone } from './icones';

const meta: Meta<typeof Icone> = {
    title: 'Icones',
    component: Icone,
};
export default meta;

export const Principal: StoryObj<typeof Icone> = {
    args: { taille: 24, nom: "carte"},
};
