import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CasinosCreationDto } from '../dto/casinos.dto'; // adjust paths / names to your project
import { CasinosUpdateDto } from '../dto/casinos.dto';

/*
 * The DTOs are validated the way your global ValidationPipe does it:
 * transform + whitelist + forbidNonWhitelisted.
 *
 * ASSUMPTIONS TO CHECK (change the constants to your real limits):
 *  - name, city and address are trimmed, non-empty strings with a maximum length.
 *  - The update DTO has the same three fields, all optional, AT LEAST ONE required.
 *  - Nothing else is accepted (id, deletedAt, timestamps...).
 */

const NAME_MAX = 50;
const CITY_MAX = 50;
const ADDRESS_MAX = 50;

const VALID = { name: 'Casino de Lausanne', city: 'Lausanne', address: 'Rue du Lac 1' };

// returns the instance AFTER transformation, and the names of the properties that failed
const check = async <T extends object>(cls: new () => T, body: unknown) => {
    const instance = plainToInstance(cls, body as object);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    return { instance, failed: errors.map((e) => e.property).sort() };
};

describe('CasinosCreationDto', () => {
    const run = (body: unknown) => check(CasinosCreationDto, body);

    it('accepts a valid body', async () => {
        const { failed } = await run(VALID);
        expect(failed).toEqual([]);
    });

    it('trims the three fields', async () => {
        const { instance, failed } = await run({ name: '  Casino  ', city: ' Bern ', address: '  Rue 1  ' });

        expect(failed).toEqual([]);
        expect(instance).toMatchObject({ name: 'Casino', city: 'Bern', address: 'Rue 1' });
    });

    it.each(['name', 'city', 'address'])('rejects a body without %s', async (field) => {
        const body: Record<string, unknown> = { ...VALID };
        delete body[field];

        const { failed } = await run(body);

        expect(failed).toContain(field);
    });

    it('rejects an empty body (all three fields fail)', async () => {
        const { failed } = await run({});
        expect(failed).toEqual(['address', 'city', 'name']);
    });

    it.each(['name', 'city', 'address'])('rejects an empty %s', async (field) => {
        const { failed } = await run({ ...VALID, [field]: '' });
        expect(failed).toContain(field);
    });

    it.each(['name', 'city', 'address'])('rejects a whitespace-only %s', async (field) => {
        const { failed } = await run({ ...VALID, [field]: '   \t  ' });
        expect(failed).toContain(field);
    });

    it.each([
        ['a number', 42],
        ['null', null],
        ['an array', ['a']],
        ['an object', { x: 1 }],
        ['a boolean', true],
    ])('rejects a name that is %s', async (_label, value) => {
        const { failed } = await run({ ...VALID, name: value });
        expect(failed).toContain('name');
    });

    describe('length limits (boundary)', () => {
        it.each([
            ['name', NAME_MAX],
            ['city', CITY_MAX],
            ['address', ADDRESS_MAX],
        ])('%s: exactly the maximum passes, one more fails', async (field, max) => {
            const ok = await run({ ...VALID, [field]: 'a'.repeat(max) });
            const tooLong = await run({ ...VALID, [field]: 'a'.repeat(max + 1) });

            expect(ok.failed).toEqual([]);
            expect(tooLong.failed).toContain(field);
        });

        it('the limit applies AFTER trimming (padding does not count)', async () => {
            const { failed } = await run({ ...VALID, name: ` ${'a'.repeat(NAME_MAX)} ` });
            expect(failed).toEqual([]);
        });
    });

    describe('nothing outside the three fields is accepted', () => {
        it.each([
            ['id', 'custom-id'],
            ['deletedAt', null],
            ['createdAt', '2020-01-01'],
            ['updatedAt', '2020-01-01'],
            ['memberships', []],
            ['role', 'ADMIN'],
        ])('rejects the extra field %s', async (field, value) => {
            const { failed } = await run({ ...VALID, [field]: value });
            expect(failed).toContain(field);
        });
    });
});

describe('CasinosUpdateDto', () => {
    const run = (body: unknown) => check(CasinosUpdateDto, body);

    it('accepts all three fields', async () => {
        const { failed } = await run(VALID);
        expect(failed).toEqual([]);
    });

    it.each([
        ['name only', { name: 'New name' }],
        ['city only', { city: 'Geneva' }],
        ['address only', { address: 'Quai 1' }],
        ['two fields', { name: 'New name', city: 'Geneva' }],
    ])('accepts a partial body: %s', async (_label, body) => {
        const { failed } = await run(body);
        expect(failed).toEqual([]);
    });

    it('leaves the fields that were not sent undefined (so Prisma does not touch them)', async () => {
        const { instance } = await run({ city: 'Geneva' });

        expect(instance.name).toBeUndefined();
        expect(instance.address).toBeUndefined();
        expect(instance.city).toBe('Geneva');
    });

    it('trims the fields', async () => {
        const { instance, failed } = await run({ name: '  Padded  ' });

        expect(failed).toEqual([]);
        expect(instance.name).toBe('Padded');
    });

    it.each(['name', 'city', 'address'])('rejects a %s that is empty or whitespace-only when it is sent', async (field) => {
        expect((await run({ [field]: '' })).failed).toContain(field);
        expect((await run({ [field]: '   ' })).failed).toContain(field);
    });

    it.each(['name', 'city', 'address'])('rejects %s set to null (null is not "unchanged")', async (field) => {
        const { failed } = await run({ [field]: null });
        expect(failed).toContain(field);
    });

    it.each(['name', 'city', 'address'])('rejects a %s that is not a string', async (field) => {
        expect((await run({ [field]: 42 })).failed).toContain(field);
        expect((await run({ [field]: { x: 1 } })).failed).toContain(field);
    });

    describe('length limits (boundary)', () => {
        it.each([
            ['name', NAME_MAX],
            ['city', CITY_MAX],
            ['address', ADDRESS_MAX],
        ])('%s: exactly the maximum passes, one more fails', async (field, max) => {
            const ok = await run({ [field]: 'a'.repeat(max) });
            const tooLong = await run({ [field]: 'a'.repeat(max + 1) });

            expect(ok.failed).toEqual([]);
            expect(tooLong.failed).toContain(field);
        });
    });

    describe('nothing outside the three fields is accepted', () => {
        it.each([
            ['id', 'other-id'],
            ['deletedAt', null], // an update must never be able to "undelete" a casino
            ['createdAt', '2020-01-01'],
            ['updatedAt', '2020-01-01'],
            ['memberships', []],
        ])('rejects the extra field %s, even next to a valid one', async (field, value) => {
            const { failed } = await run({ city: 'Geneva', [field]: value });
            expect(failed).toContain(field);
        });
    });
});