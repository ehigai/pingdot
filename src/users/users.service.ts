import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOrCreate(clerkId: string, email: string, full_name: string) {
    let user = await this.prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      const password_hash = '';
      user = await this.prisma.user.create({
        data: { clerkId, email, password_hash, full_name },
      });
    }
    return user;
  }
}
