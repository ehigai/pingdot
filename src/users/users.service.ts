import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(email: string) {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  async fetchUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      omit: {
        password_hash: true,
      },
    });
  }

  async createUser(data: Prisma.UserCreateInput) {
    let user = await this.prisma.user.create({ data });
    return user;
  }

  async setPresence(userId: string, online: boolean) {
    return this.prisma.userPresence.upsert({
      where: { userId },
      update: { isOnline: online, lastSeenAt: new Date() },
      create: { userId, isOnline: online, lastSeenAt: new Date() },
    });
  }
}
