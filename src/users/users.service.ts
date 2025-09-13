import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async findOrCreate(clerkId: string, email: string) {
    let user = await this.repo.findOne({ where: { clerkId } });
    if (!user) {
      user = this.repo.create({ clerkId, email });
      await this.repo.save(user);
    }
    return user;
  }
}
