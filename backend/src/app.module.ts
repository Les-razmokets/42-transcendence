/**
 * Module racine de l'application, démarré par main.ts.
 * Assemble les briques de l'app :
 *  - imports     : autres modules dont on dépend (ex. UsersModule, PrismaModule)
 *  - controllers : classes qui exposent des routes HTTP
 *  - providers   : services injectables disponibles dans ce module
 */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CasinosModule } from './casinos/casinos.module';
import { TablesModule } from './tables/tables.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WebsocketsModule } from './websockets/websockets.module';
import { AppThrottlerGuard } from './common/app.throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../.env', // TODO: A changer quand nos docker seront en place
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 600000, limit: 100 }],
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    // Crons off when SCHEDULER_DISABLED=true (tests: avoids extra crons on the shared DB)
    ...(process.env.SCHEDULER_DISABLED === 'true'
      ? []
      : [ScheduleModule.forRoot()]),
    HealthModule,
    MetricsModule,
    AuthModule,
    UsersModule,
    CasinosModule,
    TablesModule,
    ReservationsModule,
    PaymentsModule,
    PrismaModule,
    WebsocketsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
