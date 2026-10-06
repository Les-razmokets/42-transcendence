import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable() // decorateur : étiquette collée sur la classe -> injectable = Il permet à Nest de lire les paramètres du constructeur
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'), // getOrThrow car si l'URL de la DB manque dans le .env alors notre programme ne se lance pas
      }),
    });
  }

  /* Avant Prisma 7, $connect() démarrait le moteur Rust, qui ouvrait réellement une connexion à Postgres. Avec les driver adapters, c'est différent :
- PrismaPg crée un pool de connexions pg (un réservoir de connexions réutilisables) ;
- un pool est paresseux : il n'ouvre une connexion que lorsqu'une requête en a besoin ;
- $connect() se contente donc de préparer le client. Il ne parle pas à Postgres, et il ne peut pas échouer si la base est éteinte.*/
  async onModuleInit() {
    // async : « cette fonction utilise await »
    await this.$connect(); //await : « attends le résultat ici »
    await this.$queryRaw`SELECT 1`; // attend une reponse de la DB si echoue throw et arret du programme
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
