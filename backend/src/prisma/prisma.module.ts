import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/*Un module est une boîte fermée. Par défaut, 
tout ce qui est dans providers est privé au module : seules les classes de ce module peuvent se le faire injecter.

Global : tous les modules métier ont besoin de la DB ; une seule instance = un seul pool de connexions 

exports : ouvrir la boîte. Mettre une classe dans exports, 
c'est dire : « tout module qui importe PrismaModule peut utiliser ce provider ». 
C'est l'équivalent de la différence entre private et public sur une classe, mais au niveau des modules.
*/

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
