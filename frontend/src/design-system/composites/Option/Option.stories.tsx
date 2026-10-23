import type { Meta, StoryObj } from '@storybook/react-vite';
import { Option } from './Option';

const meta: Meta<typeof Option> = {
  title: 'Formulaires/Option',
  component: Option,
  args: { name: 'demo', libelle: 'Français' },
  decorators: [(Story) => <div style={{ width: 350 }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof Option>;

export const NonSelectionnee: Story = {};

export const Selectionnee: Story = {
  args: { description: 'Langue actuelle', defaultChecked: true },
};

export const Langues: Story = {
  render: () => (
    <div role="radiogroup" aria-label="Langue" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Option name="langue" value="fr" libelle="Français" description="Langue actuelle" defaultChecked />
      <Option name="langue" value="de" libelle="Deutsch" />
      <Option name="langue" value="it" libelle="Italiano" />
      <Option name="langue" value="en" libelle="English" />
    </div>
  ),
};