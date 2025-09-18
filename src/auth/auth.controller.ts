import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Res,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { PublicRoute } from './auth.public';
import { type Response, type Request } from 'express';

@PublicRoute()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // LOGIN
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password } = dto;

    const { accessToken, refreshToken } = await this.authService.signIn(
      email,
      password,
    );

    // set refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    return { accessToken };
  }

  // REGISTER
  @Post('register')
  signUp(@Body() dto: SignUpDto) {
    const { email, password, full_name } = dto;
    return this.authService.signUp({ email, full_name, password });
  }

  // REFRESH
  @Get('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: string = req.cookies['refreshToken'];
    const { accessToken, newRefreshToken } =
      await this.authService.refresh(refreshToken);

    // rotate refresh token
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    return { accessToken };
  }
}
