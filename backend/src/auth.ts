import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db";
import type { Role, User, Employee } from "./types";

export const JWT_SECRET = process.env.JWT_SECRET || "janamen-dev-secret-change-me";
const TOKEN_TTL = "12h";

export interface AuthCtx {
  user: User;
  employee: Employee;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthCtx;
    }
  }
}

export function sign(user: User): string {
  return jwt.sign({ sub: user.id, role: user.role, employee_id: user.employee_id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Requires a valid JWT; attaches req.auth. Throws 401 otherwise. */
export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "unauthorized", "Требуется авторизация");
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, "unauthorized", "Недействительный или истёкший токен");
  }
  const sub = Number(payload.sub);
  const user = db.users.find((u) => u.id === sub);
  if (!user) throw new HttpError(401, "unauthorized", "Пользователь не найден");
  const employee = db.employees.find((e) => e.id === user.employee_id);
  if (!employee) throw new HttpError(401, "unauthorized", "Сотрудник не найден");
  req.auth = { user, employee };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.user.role)) {
      throw new HttpError(403, "forbidden", "Недостаточно прав");
    }
    next();
  };
}

/** Is `managerEmployeeId` the direct manager of `employeeId`? */
export function isManagerOf(managerEmployeeId: number, employeeId: number): boolean {
  const e = db.employees.find((x) => x.id === employeeId);
  return !!e && e.manager_id === managerEmployeeId;
}
