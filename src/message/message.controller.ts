import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(@Body() createMessageDto: CreateMessageDto) {
    return this.messageService.create(createMessageDto);
  }

  // Create a new conversation
  // @Post('/conversations/new')
  // async createConversation(
  //   @Body() data: CreateConversationDto,
  //   @Request() req,
  // ) {
  //   const { sub: userId } = req.user;
  //   return await this.messageService.createConversation(data, userId);
  // }
  // Get all conversations
  @Get('conversations')
  async findAllConversations(@Request() req) {
    const { sub: userId } = req.user;
    return await this.messageService.findAllUserConversations(userId);
  }

  // Get the open conversation
  @Get('conversations/:conversationId')
  async openConversation(@Param('conversationId') id: string) {
    return await this.messageService.getOpenConversationMessages(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messageService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMessageDto: UpdateMessageDto) {
    return this.messageService.update(+id, updateMessageDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messageService.remove(+id);
  }
}
