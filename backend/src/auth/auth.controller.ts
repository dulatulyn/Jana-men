import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength } from "class-validator";
import { CurrentUser, Public, type AuthUser } from "./auth.decorators";
import { AuthService } from "./auth.service";

class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Введите корректный email" })
  email: string;

  @IsString({ message: "Введите пароль" })
  @MaxLength(200)
  password: string;
}

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post("auth/login")
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get("me")
  me(@CurrentUser() me: AuthUser) {
    return this.auth.me(me);
  }
}
