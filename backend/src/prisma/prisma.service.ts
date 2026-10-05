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

  async onModuleInit() {
    // async : « cette fonction utilise await »
    await this.$connect(); //await : « attends le résultat ici »
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
