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
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CasinosModule } from './casinos/casinos.module';
import { TablesModule } from './tables/tables.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../.env', // TODO: A changer quand nos docker seront en place
      isGlobal: true,
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    CasinosModule,
    TablesModule,
    ReservationsModule,
    PaymentsModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
