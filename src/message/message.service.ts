import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MessageService {
  constructor(private prisma: PrismaService) {}

  async create(createMessageDto: CreateMessageDto & { senderId: string }) {
    const { conversationId, content, senderId } = createMessageDto;
    // ensure conversation exists
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!convo) {
      throw new BadRequestException('Conversation not found');
    }

    try {
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          content,
        },
      });
      return message;
    } catch (err) {
      // rethrow as BadRequest for gateway to handle
      throw new BadRequestException('Failed to create message');
    }
  }

  findAll() {
    return this.prisma.message.findMany();
  }

  findOne(id: number) {
    return this.prisma.message.findUnique({ where: { id: String(id) } });
  }

  update(id: number, updateMessageDto: UpdateMessageDto) {
    return this.prisma.message.update({
      where: { id: String(id) },
      data: updateMessageDto,
    });
  }

  remove(id: number) {
    return this.prisma.message.delete({ where: { id: String(id) } });
  }
}
