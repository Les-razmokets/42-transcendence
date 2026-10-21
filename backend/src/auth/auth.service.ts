import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UsersCreationDto } from '../users/dto/users.dto';
import { Argon2Hasher } from './argon2-hasher.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly hasher: Argon2Hasher,
  ) {}

  async register(dto: UsersCreationDto) {
    const passwordHash = await this.hasher.hash(dto.password);
    return this.users.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      pseudo: dto.pseudo,
      email: dto.email,
      birthDate: dto.birthDate,
      phone: dto.phone,
      passwordHash,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    const ok = await this.hasher.verify(dto.password, user?.passwordHash);
    if (!user || !user.passwordHash || user.deletedAt || !ok)
      throw new UnauthorizedException('Invalid credentials');
    if (this.hasher.needsRehash(user.passwordHash)) {
      const newHash = await this.hasher.hash(dto.password);
      await this.users.updatePasswordHash(user.id, newHash);
    }
    return user;
  }
}
