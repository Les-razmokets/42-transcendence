import type { Meta, StoryObj } from '@storybook/react-vite';
import { QrCode } from './QrCode';

const meta: Meta<typeof QrCode> = {
  title: 'Affichage/QrCode',
  component: QrCode,
  args: {  }
};
export default meta;
type Story = StoryObj<typeof QrCode>;
export const Confirmation: Story = { args: { valeur: 'FLR-1610-0042' } };
export const Miniature: Story = { args: { valeur: 'FLR-1610-0042', taille: 72 } };