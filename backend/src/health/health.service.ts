import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthDto } from './dto/health.dto';

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}
  async getStatus(): Promise<{ status: string }> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return { status: 'Database connection ok' };
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
  }
  create(_dto: HealthDto): string {
    return "{ received: dto, status: 'ok' }";
  }
}
