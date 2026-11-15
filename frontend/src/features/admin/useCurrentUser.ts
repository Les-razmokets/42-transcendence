import { currentUserMock } from '../../lib/mocks/session';

// endroit à changer quand le SessionProvider (TSK-55) sera mergé.
export function useCurrentUser() {
  return currentUserMock;
}
