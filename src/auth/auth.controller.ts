import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { PublicRoute } from './auth.public';

@PublicRoute()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() dto: SignInDto) {
    const { email, password } = dto;
    return this.authService.signIn(email, password);
  }

  @Post('register')
  signUp(@Body() dto: SignUpDto) {
    const { email, password, full_name } = dto;
    return this.authService.signUp({ email, full_name, password });
  }
}
