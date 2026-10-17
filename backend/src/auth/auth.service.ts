import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { ApiError } from "../common/errors";
import { employeeView } from "../common/views";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./auth.decorators";

// Compared against when the email is unknown, so both failure paths cost one bcrypt round.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", 10);

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { employee: true },
    });
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new ApiError(401, "invalid_credentials", "Неверный email или пароль");

    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return {
      token,
      user: { id: user.id, role: user.role, employee_id: user.employee_id, full_name: user.employee.full_name, locale: user.locale },
    };
  }

  async me(me: AuthUser) {
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: me.employee_id } });
    return {
      id: me.id,
      role: me.role,
      employee_id: me.employee_id,
      full_name: employee.full_name,
      locale: me.locale,
      email: me.email,
      employee: employeeView(employee),
    };
  }
}
