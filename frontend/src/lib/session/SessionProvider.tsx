import { useEffect, useState, type ReactNode } from "react";
import type { MyProfileWithMemberships } from "@transcendence/shared";
import { request } from "../api";
import { SessionContext } from './contexte';

function recupererUser() {
    return request<MyProfileWithMemberships>('GET', '/users/me');
}

export function SessionProvider({ children }: {children: ReactNode}) {
    const [user, setUser] = useState<MyProfileWithMemberships | null>(null);
    const [load, setLoad] = useState(true);

    useEffect(() => {
        recupererUser()
        .then((u) => setUser(u))
        .catch(() => setUser(null))
        .finally(() => setLoad(false))
    }, []);

    async function connect() {
        setUser(await recupererUser());
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