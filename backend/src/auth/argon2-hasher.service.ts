import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class Argon2Hasher implements OnModuleInit {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id, // Hybrid version resistant to side-channel and GPU attacks
    memoryCost: 2 ** 16, // Memory usage in kibibytes (64 MB)
    timeCost: 3, // Number of iterations (passes over memory)
    parallelism: 1, // Degree of parallelism (number of threads)
  };

  // Validates password length and normalizes it.
  private normalize(password: string): string {
    if (password.length === 0 || Buffer.byteLength(password) > 4096)
      throw new RangeError('Password must be between 1 and 4096 bytes.');
    return password.normalize('NFC');
  }

  // Fallback hash used for timing-attack mitigation when a user is not found in the database
  private dummyHash!: string;

  // Initializes the dummy hash when the module loads
  async onModuleInit() {
    this.dummyHash = await argon2.hash('dummy-password', this.options);
  }

  // Hashes a plain-text password using the configured options after normalization
  async hash(password: string): Promise<string> {
    const normalized = this.normalize(password);
    return argon2.hash(normalized, this.options);
  }

  // Verifies a plain-text password against a stored hash (uses dummyHash to prevent user enumeration via timing)
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
