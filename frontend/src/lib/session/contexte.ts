import { createContext, useContext } from "react";
import type { MyProfileWithMemberships } from "@transcendence/shared";

export type Session = {
    user: MyProfileWithMemberships | null;
    load: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
    const session = useContext(SessionContext);
    if (!session) {
        throw new Error('useSession doit être utilisé dans un <SessionProvider>');
    }
    return session;
}
