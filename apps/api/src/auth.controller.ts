import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    if (!body.email || !body.password) throw new BadRequestException('Email и пароль обязательны');
    return this.auth.login(body.email, body.password);
  }
}
