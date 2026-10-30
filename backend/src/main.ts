import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { configureApp } from './app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<string>('PORT');
  configureApp(app);
  app.enableCors({
    origin: [configService.getOrThrow<string>('FRONTEND_URL')], // Allowed origins
    credentials: true, // Allow credentials (e.g., cookies)
  });
  await app.listen(parseInt(port, 10), '0.0.0.0');
}
void bootstrap();
