import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [MessageController],
  providers: [MessageGateway, MessageService],
  exports: [MessageService], // Export, so that userService can access it
})
export class MessageModule {}
