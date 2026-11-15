import { RouterProvider } from 'react-router/dom';
import { router } from './Routes';
import { SessionProvider } from './lib/session/SessionProvider';

export default function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  )
}
