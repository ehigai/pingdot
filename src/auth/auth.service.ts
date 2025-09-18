import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/sign-up.dto';
import { jwtConstants } from './constants';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async signUp(data: SignUpDto) {
    console.log('data:', data);
    let user = await this.usersService.findOne(data.email);
    if (user) {
      throw new UnauthorizedException('User already exists');
    }

    const hash = await bcrypt.hash(data.password, 12);

    user = await this.usersService.createUser({
      email: data.email,
      full_name: data.full_name,
      password_hash: hash,
    });

    if (!user) {
      throw new UnauthorizedException('Error creating User');
    }

    return user;
  }

  async signIn(email: string, password: string) {
    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password_hash, ...result } = user;

    const isValid = await bcrypt.compare(password, password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        secret: jwtConstants.secret,
        expiresIn: '15m',
      }),
      refreshToken: await this.jwtService.signAsync(payload, {
        secret: jwtConstants.refreshSecret,
        expiresIn: '7d',
      }),
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: jwtConstants.refreshSecret,
      });

      const userId = payload.sub;

      const accessToken = await this.jwtService.signAsync(
        { sub: userId, email: payload.email },
        { secret: jwtConstants.secret, expiresIn: '15m' },
      );

      const newRefreshToken = await this.jwtService.signAsync(
        { sub: userId, email: payload.email },
        { secret: jwtConstants.refreshSecret, expiresIn: '7d' },
      );

      return { accessToken, newRefreshToken };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
