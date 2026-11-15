import { NavLink, Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useCurrentUser';
import { canManageCasino, getCasinoAccess } from './access';
import styles from './Admin.module.css';

const classeLien = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.lien} ${styles.actif}` : styles.lien;

export function CasinoLayout() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { casinoId = '' } = useParams();
  const access = getCasinoAccess(user, casinoId);

  if (access === null) {
    return <p>{t('admin.accesRefuse')}</p>;
  }

  const base = `/admin/casinos/${casinoId}`;

  return (
    <>
      <nav aria-label={t('admin.menuCasino')} className={styles.onglets}>
        <NavLink to={base} end className={classeLien}>
          {t('admin.tables')}
        </NavLink>
        <NavLink to={`${base}/reservations`} className={classeLien}>
          {t('admin.reservations')}
        </NavLink>
        <NavLink to={`${base}/members`} className={classeLien}>
          {t('admin.personnel')}
        </NavLink>
        {canManageCasino(access) && (
          <NavLink to={`${base}/settings`} className={classeLien}>
            {t('admin.reglages')}
          </NavLink>
        )}
      </nav>
      <Outlet />
    </>
  );
}
