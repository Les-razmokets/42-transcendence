// SceneTable.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SceneTable } from './SceneTable';

const meta: Meta<typeof SceneTable> = {
  title: '3D/SceneTable',
  component: SceneTable,
  args: {
    places: ['libre', 'occupee', 'libre', 'occupee', 'selection', 'libre', 'occupee', 'occupee', 'libre'],
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', height: '80vh' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SceneTable>;

export const VueDessus: Story = {};
export const Pleine: Story = { args: { places: Array(9).fill('occupee') } };
