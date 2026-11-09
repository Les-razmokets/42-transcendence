import { describe, it, expect } from '@jest/globals';
import {
  publicCasinoSchema,
  adminCasinoSchema,
} from '../utils/casinos-response.schemas';

/*
 * The schemas are WHITELISTS: whatever the database row contains, only these fields leave the API.
 */

const row = {
  id: 'casino-1',
  name: 'Casino de Lausanne',
  city: 'Lausanne',
  address: 'Rue du Lac 1',
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-02-01T10:00:00Z'),
  deletedAt: null,
};

const PUBLIC_KEYS = ['address', 'city', 'id', 'name'];
const ADMIN_KEYS = [
  'address',
  'city',
  'createdAt',
  'deletedAt',
  'id',
  'name',
  'updatedAt',
];

describe('publicCasinoSchema', () => {
  it('keeps exactly id, name, city and address', () => {
    const out = publicCasinoSchema.parse(row);
    expect(Object.keys(out).sort()).toEqual(PUBLIC_KEYS);
  });

  it('keeps the values untouched', () => {
    expect(publicCasinoSchema.parse(row)).toEqual({
      id: row.id,
      name: row.name,
      city: row.city,
      address: row.address,
    });
  });

  it('never exposes the timestamps or deletedAt, even when the row is deleted', () => {
    const out = publicCasinoSchema.parse({
      ...row,
      deletedAt: new Date(),
    }) as Record<string, unknown>;

    expect(out).not.toHaveProperty('deletedAt');
    expect(out).not.toHaveProperty('createdAt');
    expect(out).not.toHaveProperty('updatedAt');
  });

  it('drops unknown keys (relations, anything a query might add)', () => {
    const out = publicCasinoSchema.parse({
      ...row,
      memberships: [{ userId: 'u1', role: 'OWNER' }],
      tables: [],
      passwordHash: '$argon2id$should-never-be-here',
    }) as Record<string, unknown>;

    expect(Object.keys(out).sort()).toEqual(PUBLIC_KEYS);
    expect(JSON.stringify(out)).not.toContain('argon2');
  });

  it.each(['id', 'name', 'city', 'address'])(
    'rejects a row without %s',
    (field) => {
      const broken: Record<string, unknown> = { ...row };
      delete broken[field];

      expect(publicCasinoSchema.safeParse(broken).success).toBe(false);
    },
  );

  it.each([
    ['name', 42],
    ['city', null],
    ['address', { street: 'x' }],
  ])('rejects a %s that is not a string', (field, value) => {
    expect(
      publicCasinoSchema.safeParse({ ...row, [field]: value }).success,
    ).toBe(false);
  });
});

describe('adminCasinoSchema', () => {
  it('keeps the public fields plus createdAt, updatedAt and deletedAt', () => {
    const out = adminCasinoSchema.parse(row);
    expect(Object.keys(out).sort()).toEqual(ADMIN_KEYS);
  });

  it('accepts deletedAt as null (active) and as a date (deleted)', () => {
    expect(
      adminCasinoSchema.safeParse({ ...row, deletedAt: null }).success,
    ).toBe(true);
    expect(
      adminCasinoSchema.safeParse({ ...row, deletedAt: new Date() }).success,
    ).toBe(true);
  });

  it.each(['createdAt', 'updatedAt'])('rejects a row without %s', (field) => {
    const broken: Record<string, unknown> = { ...row };
    delete broken[field];

    expect(adminCasinoSchema.safeParse(broken).success).toBe(false);
  });

  it('still drops unknown keys', () => {
    const out = adminCasinoSchema.parse({
      ...row,
      memberships: [],
      tables: [],
    }) as Record<string, unknown>;

    expect(Object.keys(out).sort()).toEqual(ADMIN_KEYS);
  });

  it('is a superset of the public view, never the other way round', () => {
    const publicKeys = Object.keys(publicCasinoSchema.parse(row));
    const adminKeys = Object.keys(adminCasinoSchema.parse(row));

    for (const key of publicKeys) expect(adminKeys).toContain(key);
    expect(adminKeys.length).toBeGreaterThan(publicKeys.length);
  });
});
