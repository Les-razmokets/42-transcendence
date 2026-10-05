import { Controller, Get, Post, Body } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthDto } from './dto/health.dto';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getStatus(): string {
    return this.healthService.getStatus();
  }

  @Post()
  create(@Body() dto: HealthDto) {
    return this.healthService.create(dto);
  }
}
