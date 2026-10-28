import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Argon2Hasher } from '../argon2-hasher.service';

describe('Argon2Hasher', () => {
  let hasher: Argon2Hasher;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [Argon2Hasher],
    }).compile();

    // compile() does NOT run lifecycle hooks: without init(), dummyHash stays undefined
    await module.init();
    hasher = module.get(Argon2Hasher);
  });

  describe('lifecycle', () => {
    it('computes the dummy hash on init', () => {
      expect(typeof hasher['dummyHash']).toBe('string');
      expect(hasher['dummyHash']).toMatch(/^\$argon2id\$/);
    });
  });

  describe('hash', () => {
    it('never returns the plaintext and uses argon2id', async () => {
      const hash = await hasher.hash('correct horse battery staple');
      expect(hash).not.toContain('correct horse battery staple');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('produces different hashes for the same password (salt)', async () => {
      const a = await hasher.hash('same-password');
      const b = await hasher.hash('same-password');
      expect(a).not.toEqual(b);
    });

    it('throws a RangeError on an empty password', async () => {
      await expect(hasher.hash('')).rejects.toThrow(RangeError);
    });

    it('throws a RangeError above 4096 bytes', async () => {
      await expect(hasher.hash('a'.repeat(4097))).rejects.toThrow(RangeError);
    });

    it('accepts exactly 4096 bytes', async () => {
      await expect(hasher.hash('a'.repeat(4096))).resolves.toMatch(
        /^\$argon2id\$/,
      );
    });

    it('counts bytes, not characters', async () => {
      // 'é' (precomposed) is 2 bytes in UTF-8: 2049 * 2 = 4098 bytes
      await expect(hasher.hash('\u00e9'.repeat(2049))).rejects.toThrow(
        RangeError,
      );
    });
  });

  describe('verify', () => {
    let hash: string;

    beforeAll(async () => {
      hash = await hasher.hash('right-password');
    });

    it('returns true for the right password', async () => {
      await expect(hasher.verify('right-password', hash)).resolves.toBe(true);
    });

    it('returns false for a wrong password', async () => {
      await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false);
    });

    it('returns false (does not throw) on a garbage hash', async () => {
      await expect(hasher.verify('right-password', 'not-a-hash')).resolves.toBe(
        false,
      );
    });

    it('returns false on an empty password', async () => {
      await expect(hasher.verify('', hash)).resolves.toBe(false);
    });

    it('returns false on a password above 4096 bytes', async () => {
      await expect(hasher.verify('a'.repeat(4097), hash)).resolves.toBe(false);
    });

    it.each([null, undefined, ''])(
      'returns false when the stored hash is %p (unknown user / no password)',
      async (storedHash) => {
        await expect(hasher.verify('whatever', storedHash)).resolves.toBe(
          false,
        );
      },
    );

    it('returns false for the literal dummy password when there is no stored hash', async () => {
      await expect(hasher.verify('dummy-password', null)).resolves.toBe(false);
    });

    it('treats composed and decomposed unicode as the same password (NFC)', async () => {
      const composed = '\u00e9'; // é
      const decomposed = 'e\u0301'; // e + combining acute
      const h = await hasher.hash(composed);
      await expect(hasher.verify(decomposed, h)).resolves.toBe(true);
    });
  });

  describe('needsRehash', () => {
    it('returns false for a hash made with the current options', async () => {
      const hash = await hasher.hash('password');
      expect(hasher.needsRehash(hash)).toBe(false);
    });

    it('returns true for a hash made with weaker options', async () => {
      const weak = await argon2.hash('password', {
        type: argon2.argon2id,
        memoryCost: 2 ** 10,
        timeCost: 1,
        parallelism: 1,
      });
      expect(hasher.needsRehash(weak)).toBe(true);
    });
  });
});
