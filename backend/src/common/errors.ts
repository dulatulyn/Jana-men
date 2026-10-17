import { HttpException } from "@nestjs/common";

/** Every API error has the contract shape `{ error: { code, message } }`. */
export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
}

export const unauthorized = (message = "Требуется вход") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "Нет доступа") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Не найдено") => new ApiError(404, "not_found", message);
export const conflict = (message: string, code = "invalid_transition") => new ApiError(409, code, message);
export const invalid = (message: string, code = "validation_error") => new ApiError(422, code, message);
