import { Controller, Get, HttpCode, Param, ParseIntPipe, Post } from "@nestjs/common";
import { Roles } from "../auth/auth.decorators";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@Roles("hr")
export class IntegrationsController {
  constructor(private integrations: IntegrationsService) {}

  @Post("1c/sync")
  @HttpCode(200)
  sync() {
    return this.integrations.syncEmployees();
  }

  @Get("log")
  log() {
    return this.integrations.journal();
  }

  @Post("log/:id/retry")
  @HttpCode(200)
  retry(@Param("id", ParseIntPipe) id: number) {
    return this.integrations.retry(id);
  }
}
