import { useEffect, useState, type ReactNode } from "react";
import type { MyProfileUser } from "@transcendence/shared";
import { request } from "../api";
import { SessionContext } from './contexte';

export function SessionProvider({ children }: {children: ReactNode}) {
    const [user, setUser] = useState<MyProfileUser | null>(null);
    const [load, setLoad] = useState(true);

    useEffect(() => {
        request<MyProfileUser>('GET', '/users/me')
        .then((u) => setUser(u))
        .catch(() => setUser(null))
        .finally(() => setLoad(false))
    }, []);

    function connect(u: MyProfileUser) {
        setUser(u);
    }

    async function disconnect() {
        try {
            await request<void>('POST', '/auth/logout');
        } catch {
            //logout on peut laisser vide ca catch le truc ou faire un console log
        } finally {
            setUser(null);
        }
    }

    return (
        <SessionContext.Provider value={{user, load, connect, disconnect}}>
            {children}
        </SessionContext.Provider>
    );
}