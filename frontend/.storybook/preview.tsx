import type { Preview } from '@storybook/react-vite';

import '@fontsource/monoton';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';

import '../src/design-system/tokens/tokens.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
  },
};

export default preview;
