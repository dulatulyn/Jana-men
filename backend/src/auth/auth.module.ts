import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { config } from "../config";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard, RolesGuard } from "./auth.guards";
import { AuthService } from "./auth.service";

@Module({
  imports: [JwtModule.register({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtTtl } })],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
