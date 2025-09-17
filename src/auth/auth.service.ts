import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/sign-up.dto';

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
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
