import { Navigate, Outlet } from "react-router";
import { useSession } from "./lib/session/contexte";

export function SafeRoute() {
    const { user, load } = useSession();

    if (load)
        return null;
    if (!user)
        return <Navigate to="/login" replace />;
    return <Outlet/>
}