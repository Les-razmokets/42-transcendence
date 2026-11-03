import { Injectable, NotFoundException } from '@nestjs/common';
import { CasinoInfo, CasinoCreateInfo } from './utils/casinos.struct';
import { Casino, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { CasinosUpdateDto } from './dto/casinos.dto';

@Injectable()
export class CasinosService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<CasinoInfo[]> {
    const casinos = await this.prisma.casino.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
      },
    });
    return casinos;
  }

  async findActiveById(id: string): Promise<CasinoInfo> {
    const casino = await this.prisma.casino.findUnique({
      where: { id },
    });
    if (!casino) throw new NotFoundException();
    return casino;
  }

  async updateCasino(
    casinoId: string,
    dto: CasinosUpdateDto,
  ): Promise<CasinoInfo> {
    try {
      return await this.prisma.casino.update({
        where: { id: casinoId, deletedAt: null },
        data: { name: dto.name, city: dto.city, address: dto.address },
        select: { id: true, name: true, city: true, address: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  async create(casinoData: CasinoCreateInfo): Promise<Casino> {
    try {
      return await this.prisma.casino.create({ data: casinoData });
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
        let field = 'Name or adress';
        if (target?.includes('name')) field = 'name';
        else if (target?.includes('adress')) field = 'adress';
        throw new ConflictException(`${field} already in use.`);
      }
      throw error;
    }
  }
}
