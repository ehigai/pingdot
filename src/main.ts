import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConstants } from './auth/constants';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: [appConstants.allowedOrigins],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  await app.listen(appConstants.port);
}
bootstrap();
