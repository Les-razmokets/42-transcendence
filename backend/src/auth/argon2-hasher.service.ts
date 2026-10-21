import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class Argon2Hasher implements OnModuleInit {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  };

  private normalize(password: string): string {
    if (password.length === 0 || Buffer.byteLength(password) > 4096)
      throw new RangeError('Password must be between 1 and 4096 bytes.');
    return password.normalize('NFC');
  }

  private dummyHash!: string;

  async onModuleInit() {
    this.dummyHash = await argon2.hash('dummy-password', this.options);
  }

  async hash(password: string): Promise<string> {
    const normalized = this.normalize(password);
    return argon2.hash(normalized, this.options);
  }

  async verify(
    password: string,
    storedHash: string | null | undefined,
  ): Promise<boolean> {
    try {
      const normalized = this.normalize(password);
      const ok = await argon2.verify(storedHash || this.dummyHash, normalized);
      return storedHash ? ok : false;
    } catch {
      return false;
    }
  }

  needsRehash(storedHash: string): boolean {
    return argon2.needsRehash(storedHash, this.options);
  }
}
