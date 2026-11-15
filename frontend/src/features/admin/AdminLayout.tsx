import { Link, NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './useCurrentUser';
import { hasAdminAccess } from './access';
import styles from './Admin.module.css';

const classeLien = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.lien} ${styles.actif}` : styles.lien;

export function AdminLayout() {
  const { t } = useTranslation();
  const user = useCurrentUser();

  if (!hasAdminAccess(user)) {
    return (
      <main className={styles.contenu}>
        <p>{t('admin.accesRefuse')}</p>
        <Link to="/">{t('admin.retourSite')}</Link>
      </main>
    );
  }

  return (
    <div className={styles.cadre}>
      <aside className={styles.menu}>
        <p className="typo-titre-3">{t('admin.titre')}</p>
        <nav aria-label={t('admin.titre')} className={styles.liens}>
          <NavLink to="/admin" end className={classeLien}>
            {t('admin.mesCasinos')}
          </NavLink>
          {user.role === 'ADMIN' && (
            <NavLink to="/admin/casinos" className={classeLien}>
              {t('admin.casinos')}
            </NavLink>
          )}
          <Link to="/" className={styles.lien}>
            {t('admin.retourSite')}
          </Link>
        </nav>
      </aside>
      <main className={styles.contenu}>
        <Outlet />
      </main>
    </div>
  );
}
