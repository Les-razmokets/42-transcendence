import {
  adminUserSchema,
  myProfileUserSchema,
  publicUserSchema,
  staffUserSchema,
} from './users-response.schemas';
 
// Un user tel que le renvoie la base : AVEC un passwordHash.
const fullUser = {
  id: '6f1c2b1e-0000-4000-8000-000000000001',
  pseudo: 'alice',
  email: 'alice@test.local',
  passwordHash: '$argon2id$v=19$secret',
  firstName: 'Alice',
  lastName: 'Martin',
  birthDate: new Date('1990-01-01'),
  phone: null,
  role: 'USER',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};
 
describe('publicUserSchema', () => {
  it('ne garde que le pseudo', () => {
    expect(publicUserSchema.parse(fullUser)).toEqual({ pseudo: 'alice' });
  });
 
  it('ne laisse jamais sortir passwordHash', () => {
    const result = publicUserSchema.parse(fullUser);
 
    expect(result).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('argon2id');
  });
 
  it('rejette un user sans pseudo', () => {
    const { pseudo, ...withoutPseudo } = fullUser;
 
    expect(() => publicUserSchema.parse(withoutPseudo)).toThrow();
  });
});
 
describe('staffUserSchema', () => {
  it('ne garde que les champs de la vue staff', () => {
    expect(staffUserSchema.parse(fullUser)).toEqual({
      id: fullUser.id,
      pseudo: fullUser.pseudo,
      email: fullUser.email,
      firstName: fullUser.firstName,
      lastName: fullUser.lastName,
      phone: null,
      role: 'USER',
      birthDate: fullUser.birthDate,
    });
  });
 
  it('accepte un user sans téléphone (phone: null)', () => {
    const result = staffUserSchema.parse({ ...fullUser, phone: null });
 
    expect(result.phone).toBeNull();
  });
 
  it('accepte un user avec téléphone', () => {
    const result = staffUserSchema.parse({
      ...fullUser,
      phone: '+41790000000',
    });
 
    expect(result.phone).toBe('+41790000000');
  });
 
  it('ne laisse sortir ni le hash ni les champs hors vue staff', () => {
    const result = staffUserSchema.parse(fullUser);
 
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
    expect(result).not.toHaveProperty('deletedAt');
    expect(JSON.stringify(result)).not.toContain('argon2id');
  });
 
  it('rejette un user dont la clé phone est absente', () => {
    const { phone, ...withoutPhone } = fullUser;
 
    expect(() => staffUserSchema.parse(withoutPhone)).toThrow();
  });
});
 
describe('myProfileUserSchema', () => {
  it('garde les champs de la vue staff plus createdAt et updatedAt', () => {
    expect(myProfileUserSchema.parse(fullUser)).toEqual({
      id: fullUser.id,
      pseudo: fullUser.pseudo,
      email: fullUser.email,
      firstName: fullUser.firstName,
      lastName: fullUser.lastName,
      phone: null,
      role: 'USER',
      birthDate: fullUser.birthDate,
      createdAt: fullUser.createdAt,
      updatedAt: fullUser.updatedAt,
    });
  });
 
  it('ne laisse sortir ni passwordHash ni deletedAt', () => {
    const result = myProfileUserSchema.parse(fullUser);
 
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('deletedAt');
    expect(JSON.stringify(result)).not.toContain('argon2id');
  });
 
  it('accepte un user avec un téléphone', () => {
    const result = myProfileUserSchema.parse({
      ...fullUser,
      phone: '+41790000000',
    });
 
    expect(result.phone).toBe('+41790000000');
  });
});
 
describe('adminUserSchema', () => {
  it('accepte un compte actif (deletedAt: null)', () => {
    const result = adminUserSchema.parse({ ...fullUser, deletedAt: null });
 
    expect(result.deletedAt).toBeNull();
  });
 
  it('accepte un compte anonymisé (deletedAt: date)', () => {
    const deletedAt = new Date('2026-01-01');
    const result = adminUserSchema.parse({ ...fullUser, deletedAt });
 
    expect(result.deletedAt).toEqual(deletedAt);
  });
 
  it('garde tous les champs sauf passwordHash', () => {
    expect(adminUserSchema.parse(fullUser)).toEqual({
      id: fullUser.id,
      pseudo: fullUser.pseudo,
      email: fullUser.email,
      firstName: fullUser.firstName,
      lastName: fullUser.lastName,
      phone: null,
      role: 'USER',
      birthDate: fullUser.birthDate,
      createdAt: fullUser.createdAt,
      updatedAt: fullUser.updatedAt,
      deletedAt: null,
    });
  });
 
  it('ne laisse jamais sortir passwordHash', () => {
    const result = adminUserSchema.parse(fullUser);
 
    expect(result).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('argon2id');
  });
 
  it('rejette un user dont la clé deletedAt est absente', () => {
    const { deletedAt, ...withoutDeletedAt } = fullUser;
 
    expect(() => adminUserSchema.parse(withoutDeletedAt)).toThrow();
  });
});