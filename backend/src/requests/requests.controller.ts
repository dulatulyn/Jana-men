import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { CommentDto, CreateRequestDto, ListRequestsQuery } from "./requests.dto";
import { RequestsService } from "./requests.service";

@Controller("requests")
export class RequestsController {
  constructor(private requests: RequestsService) {}

  @Get()
  list(@CurrentUser() me: AuthUser, @Query() q: ListRequestsQuery) {
    return this.requests.list(me, q.scope, q.status);
  }

  @Post()
  create(@CurrentUser() me: AuthUser, @Body() body: CreateRequestDto) {
    return this.requests.create(me, body);
  }

  @Get(":id")
  get(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.requests.get(me, id);
  }

  @Post(":id/approve")
  @Roles("manager", "hr")
  @HttpCode(200)
  approve(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() body: CommentDto) {
    return this.requests.approve(me, id, body.comment);
  }

  @Post(":id/reject")
  @Roles("manager", "hr")
  @HttpCode(200)
  reject(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number, @Body() body: CommentDto) {
    return this.requests.reject(me, id, body.comment);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() me: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.requests.cancel(me, id);
  }
}
