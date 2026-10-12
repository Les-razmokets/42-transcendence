import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '../generated/prisma/client';
import { UserInfo } from './users.struct';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  // finds a user from its email in the database, if it doesn't exist returns null.
  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    return user;
  }
  // finds a user from its id, if it doesnt exist, throws a notfound (404).
  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }
  // creates a user in the database, if there is a conflict (already used), throw an exception.
  async create(userData: UserInfo): Promise<User> {
    const normalizedEmail = userData.email.trim().toLowerCase();
    const normalizedPseudo = userData.pseudo.trim().toLowerCase();
    const normalizedData: UserInfo = {
      ...userData,
      email: normalizedEmail,
      pseudo: normalizedPseudo,
    };
    try {
      return await this.prisma.user.create({ data: normalizedData });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const info = error.meta as
          | {
              driverAdapterError?: {
                cause?: { constraint?: { index?: string } };
              };
            }
          | undefined;
        const target = info?.driverAdapterError?.cause?.constraint?.index;
        let field = 'Email or pseudo';
        if (target?.includes('email')) field = 'Email';
        else if (target?.includes('pseudo')) field = 'Pseudo';
        throw new ConflictException(`${field} already in use.`);
      }
      throw error;
    }
  }
}
