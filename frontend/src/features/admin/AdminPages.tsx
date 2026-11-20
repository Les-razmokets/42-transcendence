import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useCurrentUser';
import { canManageCasino, getCasinoAccess } from './access';
import styles from './Admin.module.css';

// /admin: casinos geres par l'utilisateur
export function AdminHomePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  if (!user) return null;

  return (
    <>
      <h1 className="typo-titre-1">{t('admin.mesCasinos')}</h1>
      {user.memberships.length === 0 ? (
        <p>{t('admin.aucunCasino')}</p>
      ) : (
        <ul className={styles.liste}>
          {user.memberships.map((m) => (
            <li key={m.casinoId}>
              <Link to={`/admin/casinos/${m.casinoId}`} className={styles.lien}>
                {m.casinoName} · {m.role}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// /admin/casinos: reserve a ADMIN
export function CasinosPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  if (!user) return null;

  if (user.role !== 'ADMIN') return <p>{t('admin.accesRefuse')}</p>;
  return <h1 className="typo-titre-1">{t('admin.casinos')}</h1>;
}

// /admin/casinos/:casinoId
export function CasinoTablesPage() {
  const { t } = useTranslation();
  const { casinoId } = useParams();
  return <h1 className="typo-titre-1">{t('admin.tables')} · {casinoId}</h1>;
}

// /admin/casinos/:casinoId/tables/:tableId
export function CasinoTablePage() {
  const { t } = useTranslation();
  const { tableId } = useParams();
  return <h1 className="typo-titre-1">{t('admin.table', { id: tableId })}</h1>;
}

export function CasinoReservationsPage() {
  const { t } = useTranslation();
  return <h1 className="typo-titre-1">{t('admin.reservations')}</h1>;
}

export function CasinoMembersPage() {
  const { t } = useTranslation();
  return <h1 className="typo-titre-1">{t('admin.personnel')}</h1>;
}

// reserve a OWNER et ADMIN: lien cache, adresse reste tapable
export function CasinoSettingsPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { casinoId = '' } = useParams();
  if (!user) return null;

  if (!canManageCasino(getCasinoAccess(user, casinoId))) {
    return <p>{t('admin.accesRefuse')}</p>;
  }
  return <h1 className="typo-titre-1">{t('admin.reglages')}</h1>;
}
