import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "./lib/session/contexte";

export function SafeRoute() {
    const { user, load } = useSession();
    const location = useLocation();

    if (load)
        return null;
    if (!user)
        return <Navigate to="/login" state={{from: location.pathname}} replace />;
    return <Outlet/>
}