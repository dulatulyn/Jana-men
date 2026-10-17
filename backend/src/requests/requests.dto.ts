import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { RequestStatus, RequestType } from "@prisma/client";

export const REQUEST_STATUSES: RequestStatus[] = ["submitted", "manager_approved", "approved", "rejected", "cancelled"];

export class ListRequestsQuery {
  @IsOptional()
  @IsIn(["mine", "team", "all"], { message: "scope: mine | team | all" })
  scope?: "mine" | "team" | "all";

  @IsOptional()
  @IsIn([...REQUEST_STATUSES, ""], { message: "Неизвестный статус" })
  status?: RequestStatus | "";
}

export class CreateRequestDto {
  @IsIn(["vacation", "advance"], { message: "Неизвестный тип заявки" })
  type: RequestType;

  @IsObject({ message: "payload должен быть объектом" })
  payload: Record<string, unknown>;
}

export class CommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "Комментарий слишком длинный" })
  comment?: string;
}
