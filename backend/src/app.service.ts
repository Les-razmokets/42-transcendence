/**
 * Service racine de l'application.
 * Contient la logique métier, indépendante du protocole HTTP.
 * Marqué @Injectable() pour être injecté par Nest dans AppController
 * (ou dans n'importe quel autre service/contrôleur qui en a besoin).
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World !';
  }
}
