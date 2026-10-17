import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Roles } from "../auth/auth.decorators";
import { integrationLogView } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@Roles("hr")
export class IntegrationsController {
  constructor(private integrations: IntegrationsService, private prisma: PrismaService) {}

  @Post("1c/sync")
  @HttpCode(200)
  sync() {
    return this.integrations.syncEmployees();
  }

  @Get("log")
  async log() {
    const rows = await this.prisma.integrationLog.findMany({ orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 200 });
    return rows.map(integrationLogView);
  }
}
