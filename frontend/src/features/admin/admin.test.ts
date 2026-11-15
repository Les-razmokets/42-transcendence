import { describe, it, expect } from 'vitest';
import { currentUserMock } from '../../lib/mocks/session';
import { canManageCasino, getCasinoAccess, hasAdminAccess } from './access';

const admin = { ...currentUserMock, role: 'ADMIN', memberships: [] };
const joueur = { ...currentUserMock, memberships: [] };

describe('getCasinoAccess', () => {
  it('donne le role du membership', () => {
    expect(getCasinoAccess(currentUserMock, 'casino-1')).toBe('OWNER');
    expect(getCasinoAccess(currentUserMock, 'casino-2')).toBe('FLOOR');
  });

  it("renvoie null pour un casino dont l'utilisateur n'est pas membre", () => {
    expect(getCasinoAccess(currentUserMock, 'casino-3')).toBeNull();
  });

  it('donne ADMIN a un admin, pour tous les casinos', () => {
    expect(getCasinoAccess(admin, 'casino-3')).toBe('ADMIN');
  });
});

describe('canManageCasino', () => {
  it('autorise OWNER et ADMIN', () => {
    expect(canManageCasino('OWNER')).toBe(true);
    expect(canManageCasino('ADMIN')).toBe(true);
  });

  it('refuse FLOOR et les non-membres', () => {
    expect(canManageCasino('FLOOR')).toBe(false);
    expect(canManageCasino(null)).toBe(false);
  });
});

describe('hasAdminAccess', () => {
  it("laisse entrer un membre et un admin", () => {
    expect(hasAdminAccess(currentUserMock)).toBe(true);
    expect(hasAdminAccess(admin)).toBe(true);
  });

  it('refuse un joueur sans membership', () => {
    expect(hasAdminAccess(joueur)).toBe(false);
  });
});
