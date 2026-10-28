import type { Meta, StoryObj } from '@storybook/react-vite';
import { OptionMenu } from './OptionMenu';

const meta: Meta<typeof OptionMenu> = {
  title: 'Actions/OptionMenu',
  component: OptionMenu,
  args: { children: 'Casino de Montreux' },
  decorators: [
    (Story) => (
      <div style={{ width: 264, padding: 8, background: 'var(--fond-surface)', borderRadius: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof OptionMenu>;

export const Defaut: Story = {};

export const Selected: Story = {
  args: { selected: true },
};

export const Liste: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <OptionMenu selected>Tous les casinos</OptionMenu>
      <OptionMenu>Casino de Montreux</OptionMenu>
      <OptionMenu>Grand Casino Bern</OptionMenu>
      <OptionMenu>Casino Barrière Genève</OptionMenu>
    </div>
  ),
};