import { Controller, Get, Module } from "@nestjs/common";
import { AcademyModule } from "./academy/academy.controller";
import { AccessModule } from "./access/access.service";
import { AssistantModule } from "./assistant/assistant.controller";
import { Public } from "./auth/auth.decorators";
import { AuthModule } from "./auth/auth.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule, PrismaService } from "./prisma/prisma.service";
import { ProfileModule } from "./profile/profile.controller";
import { RequestsModule } from "./requests/requests.module";
import { TeamModule } from "./team/team.controller";

@Controller("health")
class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, db: "up", ts: new Date().toISOString() };
  }
}

@Module({
  imports: [
    PrismaModule,
    AccessModule,
    AuthModule,
    NotificationsModule,
    IntegrationsModule,
    ProfileModule,
    RequestsModule,
    TeamModule,
    AcademyModule,
    AssistantModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
