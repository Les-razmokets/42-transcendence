import { INestApplication, ValidationPipe, StandardSchemaSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { missingResponseSchema } from './common/missing-response.schema';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // validator will strip validated (returned) object of any properties that do not use any validation decorators.
      transform: true, // transforms request in an instance of a DTO class.
      forbidNonWhitelisted: true, //  instead of stripping non-whitelisted properties validator will throw an exception.
    }),
  );
  app.useGlobalInterceptors(
    new StandardSchemaSerializerInterceptor(app.get(Reflector), {
      // Closed by default: every route returning an object must declare its own
      // response schema with @SerializeOptions, otherwise the request fails with 500.
      schema: missingResponseSchema,
    }),
  );
  app.use(cookieParser());
}
