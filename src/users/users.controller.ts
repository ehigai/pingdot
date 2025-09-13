import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(ClerkAuthGuard)
  @Get('me')
  async getMe(@Req() req) {
    const { sub, email } = req.user;
    return this.usersService.findOrCreate(sub, email);
  }
}
