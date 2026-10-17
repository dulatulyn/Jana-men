import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Locale, Role } from "@prisma/client";

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  employee_id: number;
  locale: Locale;
}

export const IS_PUBLIC = "isPublic";
export const ROLES = "roles";

/** Skips the JWT guard (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts an endpoint to the given roles. Ownership checks still happen in services. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
