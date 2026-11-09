// Creat metrics controller class for 

import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { register } from '@prometheus-io/client';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/utils/public.decorator';

@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  @Public()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}