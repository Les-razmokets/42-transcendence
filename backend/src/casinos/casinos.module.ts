import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasinosAccessService } from './casinos-access.service';

@Module({
  imports: [],
  providers: [ 
    CasinosAccessService,
    PrismaService,
  ],
  exports: [ CasinosAccessService ],
})
export class CasinosModule {}