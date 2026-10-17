import { ValidationError, ValidationPipe } from "@nestjs/common";
import { invalid } from "./errors";

function firstMessage(errors: ValidationError[]): string {
  for (const e of errors) {
    if (e.constraints) return Object.values(e.constraints)[0];
    if (e.children?.length) return firstMessage(e.children);
  }
  return "Некорректные данные";
}

/** DTO validation → 422 `validation_error` with the first human-readable message. */
export const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  exceptionFactory: (errors) => invalid(firstMessage(errors)),
});
