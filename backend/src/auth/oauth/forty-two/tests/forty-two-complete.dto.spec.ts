import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FortyTwoCompleteDto } from '../dto/forty-two-complete.dto';

/*
 * Validated the way the global ValidationPipe does it: transform + whitelist + forbidNonWhitelisted.
 * The identity (email, pseudo, names) comes from the signed pending token, never from the body:
 * the only thing the user may send is the birth date.
 */

const check = async (body: unknown) => {
  const instance = plainToInstance(FortyTwoCompleteDto, body as object);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, failed: errors.map((e) => e.property).sort() };
};

const yearsAgo = (years: number, extraDays = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + extraDays);
  return d.toISOString().slice(0, 10);
};

describe('FortyTwoCompleteDto', () => {
  it('accepts an adult birth date and turns it into a Date', async () => {
    const { instance, failed } = await check({ birthDate: '1990-01-01' });
    expect(failed).toEqual([]);
    expect(instance.birthDate).toBeInstanceOf(Date);
  });

  it('accepts someone who turned 18 yesterday', async () => {
    expect((await check({ birthDate: yearsAgo(18, -1) })).failed).toEqual([]);
  });

  describe('rejects (same rules as register)', () => {
    it.each([
      ['under 18', { birthDate: yearsAgo(10) }],
      ['18 tomorrow', { birthDate: yearsAgo(18, 1) }],
      ['before 1900', { birthDate: '1899-12-31' }],
      ['a garbage date', { birthDate: 'banana' }],
      ['a missing birth date', {}],
    ])('%s', async (_name, body) => {
      expect((await check(body)).failed).toContain('birthDate');
    });
  });

  describe('identity fields cannot be smuggled in the body', () => {
    it.each(['email', 'pseudo', 'firstName', 'lastName', 'role', 'password'])(
      'rejects %s',
      async (field) => {
        const { failed } = await check({
          birthDate: '1990-01-01',
          [field]: 'x',
        });
        expect(failed).toContain(field);
      },
    );
  });
});
