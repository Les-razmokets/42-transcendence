import type { Meta, StoryObj } from '@storybook/react-vite';
import { CartePaiement } from './CartePaiement';

const meta: Meta<typeof CartePaiement> = {
  title: 'Affichage/CartePaiement',
  component: CartePaiement,
  args: {
    brand: 'VISA',
    title: 'Visa •••• 4242',
    detail: 'Expire 08/28',
    libelleDefault: 'Par défaut',
  },
  decorators: [(Story) => <div style={{ width: 560, maxWidth: '100%' }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof CartePaiement>;

export const Standard: Story = {};

export const ParDefaut: Story = {
  args: { byDefault: true },
};

export const Liste: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <CartePaiement brand="VISA" title="Visa •••• 4242" detail="Expire 08/28" byDefault libelleDefault="Par défaut" />
      <CartePaiement brand="MC" title="Mastercard •••• 8817" detail="Expire 11/27" />
      <CartePaiement brand="TWINT" title="TWINT" detail="+41 79 ••• •• 42" />
    </div>
  ),
};