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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
