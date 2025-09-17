import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { MessageGateWay } from './message.gateway';

@Module({
  controllers: [MessageController],
  providers: [MessageGateWay, MessageService],
})
export class MessageModule {}
