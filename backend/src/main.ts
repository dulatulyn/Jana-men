import "reflect-metadata";
import { INestApplication, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { validationPipe } from "./common/validation";
import { config } from "./config";

/** Shared by main() and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(validationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    maxAge: 600,
  });
  app.enableShutdownHooks();
  return app;
}

async function main() {
  const app = configureApp(await NestFactory.create(AppModule, { logger: ["log", "warn", "error"] }));
  await app.listen(config.port, "0.0.0.0");
  Logger.log(`JanaMen API → http://localhost:${config.port}/api/v1 (CORS: ${config.corsOrigins.join(", ")})`, "Bootstrap");
}

if (require.main === module) void main();
