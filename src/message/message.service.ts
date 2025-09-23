import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UsersService } from 'src/users/users.service';
import type { Prisma } from '@prisma/client';
import { group } from 'console';

@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    private userService: UsersService,
  ) {}

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

  async findAll() {
    return await this.prisma.message.findMany();
  }

  async findOne(id: number) {
    return await this.prisma.message.findUnique({ where: { id: String(id) } });
  }

  async update(id: number, updateMessageDto: UpdateMessageDto) {
    return await this.prisma.message.update({
      where: { id: String(id) },
      data: updateMessageDto,
    });
  }

  remove(id: number) {
    return this.prisma.message.delete({ where: { id: String(id) } });
  }

  //  CONVERSATIONS

  async findOpenConversation(id: string) {
    return await this.prisma.conversation.findUnique({ where: { id } });
  }

  async createConversation(data: CreateConversationDto, userId: string) {
    const { name, email, isGroup, message } = data;

    for (let i = 0; i < email.length; i++) {
      const exists = await this.userService.findOne(email[i]);

      if (!exists) {
        throw new BadRequestException(
          `User with email ${email[i]} does not exist`,
        );
      }
    }
    // Ensure creator exists
    const creator = await this.userService.fetchUserProfile(userId);
    if (!creator) {
      throw new BadRequestException(`Groups must have a valid creator`);
    }

    // Build a deduplicated list of emails including the creator
    const providedEmails = Array.isArray(email) ? email : [];
    const dedupSet = new Set<string>(
      providedEmails.map((e) => e.toLowerCase()),
    );
    dedupSet.add(creator.email.toLowerCase());
    const uniqueEmails = Array.from(dedupSet);

    if (uniqueEmails.length < 2) {
      throw new BadRequestException('At least one other member is required');
    }

    // Resolve whether this is a group based on explicit flag or final participant count
    const isGroupResolved = Boolean(isGroup) || uniqueEmails.length > 2;

    // Create members array: for private convos all roles are null; for groups, creator becomes ADMIN and others MEMBER
    const members = uniqueEmails.map((memberEmail) => ({
      user: { connect: { email: memberEmail } },
      role: isGroupResolved
        ? memberEmail === creator.email.toLowerCase()
          ? 'ADMIN'
          : 'MEMBER'
        : null,
    }));

    // If this is a private convo (not a group), attempt to find an existing conversation with the exact same two participants
    if (!isGroupResolved) {
      // Resolve emails to user ids
      const users = await Promise.all(
        uniqueEmails.map((email) => this.userService.findOne(email)),
      );
      if (users.some((user) => !user)) {
        throw new BadRequestException('One or more users not found');
      }
      const userIds = users.map((user) => (user as any).id);

      // Directly find a non-group conversation that contains both userIds and no others
      // For private (2-person) conversations this enforces exact match: both users present and every member is in userIds
      const existing = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { members: { some: { userId: userIds[0] } } },
            { members: { some: { userId: userIds[1] } } },
            { members: { every: { userId: { in: userIds } } } },
          ],
        },
        include: { members: true, messages: true },
      });

      if (existing) {
        return existing; // reuse existing private conversation
      }
    }

    // Disallow creating group conversation without a group name
    if (isGroupResolved && !name) {
      throw new BadRequestException('Name is required to create a group');
    }

    // Disallow creating a group conversation with an initial message. Messages must be sent
    // individually after group creation.
    if (isGroupResolved && message) {
      throw new BadRequestException(
        'Cannot create a group conversation with an initial message. Send messages after group is created.',
      );
    }

    const convoData: any = {
      name: name || null,
      isGroup: isGroup || members.length > 2,
      members: {
        create: members,
      },
    };
    // If there's an initial message and this is not a group, create it as well
    if (message && !isGroupResolved) {
      convoData.messages = {
        create: {
          content: message,
          // Use the creator as the sender for the initial message
          senderId: creator.id,
        },
      };
    }

    return await this.prisma.conversation.create({
      data: convoData,
      include: { members: true, messages: true },
    });
  }

  async findAllUserConversations(userId: string) {
    const result = await this.prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId: {
              equals: userId,
            },
          },
        },
      },
    });
    return result;
  }
}
