import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasinosAccessService } from './casinos-access.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { CasinosController } from './casinos.controller';
import { AuthModule } from '../auth/auth.module';
import { CasinosService } from './casinos.service';
import { CasinosMembersService } from './members/casinos-members.service';
import { CasinosMembersController } from './members/casinos-members.controller';

@Module({
  imports: [ AuthModule ],
  providers: [
    CasinosAccessService,
    CasinosService,
    CasinosMembersService,
    PrismaService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  controllers: [CasinosController, CasinosMembersController],
  exports: [CasinosAccessService],
})
export class CasinosModule {}
