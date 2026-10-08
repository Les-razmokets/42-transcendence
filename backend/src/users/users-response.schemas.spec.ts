import { publicUserSchema } from './users-response.schemas';
 
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