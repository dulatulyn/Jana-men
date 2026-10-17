import { Controller, Get, HttpCode, Param, ParseIntPipe, Post } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { forbidden, notFound } from "../common/errors";
import { notificationView } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.notification.findMany({
      where: { user_id: me.id },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
    });
    return rows.map(notificationView);
  }

  // Declared before ":id/read" so "read-all" is never parsed as an id.
  @Post("read-all")
  @HttpCode(204)
  async readAll(@CurrentUser() me: AuthUser) {
    await this.prisma.notification.updateMany({ where: { user_id: me.id, read_at: null }, data: { read_at: new Date() } });
  }

  @Post(":id/read")
  @HttpCode(204)
  async read(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw notFound("Уведомление не найдено");
    if (n.user_id !== me.id) throw forbidden();
    if (!n.read_at) await this.prisma.notification.update({ where: { id }, data: { read_at: new Date() } });
  }
}
