import {
  Controller,
  Get,
  Post,
  Body,
  SerializeOptions,
} from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthDto } from './dto/health.dto';
import {
  healthResponseSchema,
  HealthResponse,
} from './health-response.schemas';

@SerializeOptions({ schema: healthResponseSchema })
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getStatus(): Promise<HealthResponse> {
    return this.healthService.getStatus();
  }

  @Post()
  create(@Body() dto: HealthDto) {
    return this.healthService.create(dto);
  }
}