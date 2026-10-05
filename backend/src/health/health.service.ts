import { Injectable } from '@nestjs/common';
import { HealthDto } from './dto/health.dto';

@Injectable()
export class HealthService {
  getStatus(): string {
    return "{ status: 'ok' }";
  }
  create(dto: HealthDto): string {
    return "{ received: dto, status: 'ok' }";
  }
}
