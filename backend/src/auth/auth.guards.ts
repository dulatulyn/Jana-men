import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "../common/errors";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC, ROLES, type AuthUser } from "./auth.decorators";

/** Global guard: every route needs a valid `Authorization: Bearer <jwt>` unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized();

    let sub: number;
    try {
      sub = Number((await this.jwt.verifyAsync<{ sub: number }>(token)).sub);
    } catch {
      throw unauthorized("Сессия истекла, войдите снова");
    }

    // Re-read the user on every request: a deleted account or changed role applies immediately.
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user) throw unauthorized("Сессия недействительна");
    req.user = { id: user.id, email: user.email, role: user.role, employee_id: user.employee_id, locale: user.locale } satisfies AuthUser;
    return true;
  }
}

/** Global guard: enforces @Roles(...) when present. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw forbidden(ROLE_MESSAGE[roles.join(",")] ?? "Недостаточно прав");
    return true;
  }
}

const ROLE_MESSAGE: Record<string, string> = {
  hr: "Доступно только HR",
  "manager,hr": "Раздел доступен руководителю и HR",
};
