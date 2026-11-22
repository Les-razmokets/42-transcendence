import { useSession } from '../../lib/session/contexte';

export function useCurrentUser() {
  return useSession().user;
}
