import { Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { EnTeteLobby } from "./design-system/composites/EnTete";
import { useSession } from "./lib/session/contexte";

export function Layout() {
    const { user } = useSession();
    const { t } = useTranslation();

    // SafeRoute garantit déjà user, mais TypeScript ne le sait pas
    if (!user)
        return null;

    return (
        <>
            <EnTeteLobby
                userName={`${user.firstName} ${user.lastName}`}
                libelleAccount={t('entete.monCompte')}
            />
            <main>
                <Outlet />
            </main>
        </>
    );
}
