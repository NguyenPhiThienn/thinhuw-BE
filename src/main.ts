import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 3000);
  const prefix = configService.get<string>('API_PREFIX', 'api/v1');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',');

  // Security
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // Serve uploaded avatars as public static files: GET /uploads/avatars/filename.jpg
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // CORS
  app.enableCors({
    origin: nodeEnv === 'development' ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // API prefix
  app.setGlobalPrefix(prefix);

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger docs (only in non-production)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Thinhuw API')
      .setDescription(
        '💕 Thinhuw - Private location sharing app for couples\n\n' +
          '## Authentication\n' +
          'Use the Authorize button to set Bearer token.\n\n' +
          '## OTP Mode\n' +
          'In development mode, OTP is always `123456`.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'access-token',
      )
      .addTag('Auth', 'Authentication and user management')
      .addTag('Couples', 'Couple pairing and management')
      .addTag('Location', 'Location sharing and history')
      .addTag('Chat', 'Messaging between couples')
      .addTag('Notifications', 'Notification management')
      .addTag('Places', 'Favorite places management')
      .addTag('Safety', 'SOS and safety features')
      .addTag('Health', 'API health checks')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  }

  await app.listen(port);
  logger.log(`🚀 Thinhuw API running on: http://localhost:${port}/${prefix}`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  logger.log(
    `📧 OTP Mode: ${configService.get<string>('OTP_MODE', 'development')}`,
  );
}

bootstrap();
