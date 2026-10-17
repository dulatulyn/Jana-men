import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

const CODE_BY_STATUS: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
  422: "validation_error",
};

/** Normalizes every error (ours, Nest's, Prisma's, unexpected) into `{ error: { code, message } }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "object") {
        return res.status(status).json(body);
      }
      const message =
        typeof body === "string" ? body : Array.isArray((body as { message?: unknown }).message)
          ? String((body as { message: unknown[] }).message[0])
          : String((body as { message?: unknown }).message ?? exception.message);
      return res.status(status).json({ error: { code: CODE_BY_STATUS[status] ?? "error", message: localize(status, message) } });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2025") return res.status(404).json({ error: { code: "not_found", message: "Не найдено" } });
      if (exception.code === "P2002") return res.status(409).json({ error: { code: "conflict", message: "Запись уже существует" } });
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(500).json({ error: { code: "internal", message: "Внутренняя ошибка сервера" } });
  }
}

function localize(status: number, message: string): string {
  if (status === 404 && message.startsWith("Cannot ")) return "Маршрут не найден";
  if (status === 400 && /JSON/i.test(message)) return "Некорректный JSON в теле запроса";
  return message;
}
