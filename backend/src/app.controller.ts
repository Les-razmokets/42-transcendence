/**
 * Contrôleur racine de l'application.
 * Reçoit les requêtes HTTP (ici GET /) et délègue le traitement à AppService.
 * Aucune logique métier ici : uniquement le routage et la mise en forme de la réponse.
 */
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
