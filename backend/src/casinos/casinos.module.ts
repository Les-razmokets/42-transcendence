import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasinosAccessService } from './casinos-access.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { CasinosController } from './casinos.controller';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { CasinosService } from './casinos.service';

@Module({
  imports: [ AuthModule ],
  providers: [
    CasinosAccessService,
    CasinosService,
    PrismaService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  controllers: [CasinosController],
  exports: [CasinosAccessService],
})
export class CasinosModule {}
