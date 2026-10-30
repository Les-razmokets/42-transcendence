import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Argon2Hasher } from '../argon2-hasher.service';
import { UsersService } from '../../users/users.service';
import { UsersCreationDto } from '../../users/dto/users.dto';
import { JwtService } from '@nestjs/jwt';

// In ESM mode (--experimental-vm-modules) `jest` is not a global: it must be imported from @jest/globals.

describe('AuthService.register', () => {
  const FAKE_HASH = '$argon2id$fake-hash-for-tests';

  const dto = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    pseudo: 'ada',
    email: 'ada@example.com',
    password: 'Correct-Horse-9-Battery!',
    birthDate: new Date('1990-01-01'),
  } as UsersCreationDto;

  const createdUser = { id: 'u1', pseudo: 'ada', email: 'ada@example.com' };

  let users: { create: jest.Mock<UsersService['create']> };
  let hasher: { hash: jest.Mock<Argon2Hasher['hash']> };
  let jwt: { sign: jest.Mock<JwtService['sign']> };
  let service: AuthService;

  beforeEach(() => {
    users = { create: jest.fn<UsersService['create']>() };
    hasher = { hash: jest.fn<Argon2Hasher['hash']>() };
    jwt = { sign: jest.fn<JwtService['sign']>() };

    hasher.hash.mockResolvedValue(FAKE_HASH);
    users.create.mockResolvedValue(
      createdUser as Awaited<ReturnType<UsersService['create']>>,
    );

    service = new AuthService(
      users as unknown as UsersService,
      hasher as unknown as Argon2Hasher,
      jwt as unknown as JwtService,
    );
  });

  it('hashes the plaintext password', async () => {
    await service.register(dto);
    expect(hasher.hash).toHaveBeenCalledWith(dto.password);
  });

  it('calls create with a passwordHash and never the plaintext password', async () => {
    await service.register(dto);

    expect(users.create).toHaveBeenCalledTimes(1);
    const arg = users.create.mock.calls[0][0];

    expect(arg.passwordHash).toBe(FAKE_HASH);
    expect(arg).not.toHaveProperty('password');
    expect(JSON.stringify(arg)).not.toContain(dto.password);
  });

  it('passes exactly the UserInfo fields, nothing else', async () => {
    // even if something extra sneaks onto the dto object, it must not reach create()
    const dirty = {
      ...dto,
      role: 'ADMIN',
      isAdmin: true,
    } as unknown as UsersCreationDto;

    await service.register(dirty);

    const arg = users.create.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(
      [
        'birthDate',
        'email',
        'firstName',
        'lastName',
        'passwordHash',
        'phone',
        'pseudo',
      ].sort(),
    );
    expect(arg).not.toHaveProperty('role');
  });

  it('returns what create returns', async () => {
    await expect(service.register(dto)).resolves.toBe(createdUser);
  });

  it('propagates the 409 from create', async () => {
    users.create.mockRejectedValue(
      new ConflictException('email already taken'),
    );
    await expect(service.register(dto)).rejects.toThrow(ConflictException);
  });

  it('does not call create if hashing fails', async () => {
    hasher.hash.mockRejectedValue(new RangeError('bad password'));
    await expect(service.register(dto)).rejects.toThrow(RangeError);
    expect(users.create).not.toHaveBeenCalled();
  });
});
