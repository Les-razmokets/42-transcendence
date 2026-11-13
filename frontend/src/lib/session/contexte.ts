import { createContext, useContext } from "react";
import type { MyProfileUser } from "@transcendence/shared";

export type Session = {
    user: MyProfileUser | null;
    load: boolean;
    connect: (user: MyProfileUser) => void;
    disconnect: () => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
    const session = useContext(SessionContext);
    if (!session) {
        throw new Error('Use session doit etre utilisé dans un <SessionProvider>');
    }
    return session;
}