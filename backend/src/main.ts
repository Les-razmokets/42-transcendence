import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  StandardSchemaSerializerInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { publicUserSchema } from './users/users-response.schemas';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<string>('PORT');
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [configService.getOrThrow<string>('FRONTEND_URL')], // Allowed origins
    credentials: true, // Allow credentials (e.g., cookies)
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // validator will strip validated (returned) object of any properties that do not use any validation decorators.
      transform: true, // transforms request in an instance of a DTO class.
      forbidNonWhitelisted: true, //  instead of stripping non-whitelisted properties validator will throw an exception.
    }),
  );
  app.useGlobalInterceptors(
    new StandardSchemaSerializerInterceptor(app.get(Reflector), {
      schema: publicUserSchema,
    }),
  );
  await app.listen(parseInt(port, 10), '0.0.0.0');
}
void bootstrap();
