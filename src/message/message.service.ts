import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UsersService } from 'src/users/users.service';
import { ReturnConversationDto } from './dto/return-conversation.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    private userService: UsersService,
  ) {}

  // -------------------------
  // Messages
  // -------------------------

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
        select: {
          id: true,
          content: true,
          imageUrl: true,
          status: true,
          conversationId: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              email: true,
            },
          },
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

  async markDelivered(messageId: string, userId: string) {
    await this.prisma.messageDelivery.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: {},
      create: { messageId, userId },
    });

    // check if all recipients got it
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: { include: { members: true } },
        deliveries: true,
      },
    });
    if (!message || message === null) {
      throw new NotFoundException();
    }

    const recipientIds = message.conversation.members
      .map((m) => m.userId)
      .filter((uid) => uid !== message.senderId);

    const allDelivered = recipientIds.every((uid) =>
      message.deliveries.some((d) => d.userId === uid),
    );

    if (allDelivered && message.status !== 'DELIVERED') {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: 'DELIVERED' },
      });
    }

    return message;
  }

  async markRead(messageId: string, userId: string) {
    await this.prisma.messageRead.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: {},
      create: { messageId, userId },
    });

    // check if all recipients read it
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { members: true } }, reads: true },
    });
    if (!message || message === null) {
      throw new NotFoundException();
    }

    const recipientIds = message.conversation.members
      .map((m) => m.userId)
      .filter((uid) => uid !== message.senderId);

    const allRead = recipientIds.every((uid) =>
      message.reads.some((r) => r.userId === uid),
    );

    if (allRead && message.status !== 'READ') {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: 'READ' },
      });
    }

    return message;
  }

  async findUndeliveredMessages(userId: string) {
    return await this.prisma.message.findMany({
      where: {
        conversation: {
          members: { some: { userId } },
        },
        deliveries: { none: { userId } }, // not yet delivered to this user
      },
    });
  }

  // -------------------------
  // Conversations - helpers
  // -------------------------

  private async resolveUsersFromEmails(emails: string[]) {
    const users = await Promise.all(
      emails.map((e) => this.userService.findOne(e)),
    );
    for (let i = 0; i < emails.length; i++) {
      if (!users[i]) {
        throw new BadRequestException(
          `User with email ${emails[i]} does not exist`,
        );
      }
    }
    return users;
  }

  private buildMemberCreates(
    uniqueEmails: string[],
    creatorEmail: string,
    isGroupResolved: boolean,
  ) {
    return uniqueEmails.map((memberEmail) => ({
      user: { connect: { email: memberEmail } },
      role: isGroupResolved
        ? memberEmail === creatorEmail.toLowerCase()
          ? 'ADMIN'
          : 'MEMBER'
        : null,
    }));
  }

  private async findExistingPrivateConversationForTwo(userIds: string[]) {
    if (userIds.length !== 2) return null;

    const existing = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: userIds[0] } } },
          { members: { some: { userId: userIds[1] } } },
          { members: { every: { userId: { in: userIds } } } },
        ],
      },
      include: {
        members: { include: { user: true } },
        messages: true,
      },
    });
    return existing;
  }

  private mapConversationForList(conversation) {
    const isGroup = conversation.isGroup;

    let name: string | null = null;
    let imageUrl: string | null = null;

    if (isGroup) {
      name = conversation.name || 'Group';
      imageUrl = conversation.image_url;
    } else {
      const other = conversation.members[0]?.user;
      name = other ? (other.full_name ? other.full_name : other.email) : null;
      imageUrl = other ? (other.profile_image ?? null) : null;
    }

    const latest = conversation.messages?.[0];
    const latestMessage = latest
      ? {
          content: latest.content,
          status: latest.status,
          createdAt: latest.createdAt,
          senderId: latest.senderId,
        }
      : { content: null, status: null, createdAt: null, senderId: null };

    const memberCount =
      (conversation as any)._count?.members ?? conversation.members.length + 1;

    const otherMembers = (conversation.members || [])
      .slice(0, 3)
      .map((member) => ({
        id: member.userId,
        email: member.user.email,
        profile_image: member.user.profile_image ?? null,
      }));

    return {
      id: conversation.id,
      name,
      latestMessage,
      imageUrl,
      memberCount,
      members: otherMembers,
      isGroup,
    };
  }

  // -------------------------
  // Conversations - public
  // -------------------------

  async getOpenConversationMessages(id: string) {
    const result = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        messages: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            status: true,
            conversationId: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return result?.messages;
  }

  async createConversation(
    data: CreateConversationDto,
    userId: string,
  ): Promise<ReturnConversationDto> {
    const { name, email, isGroup, message } = data;

    const providedEmails = Array.isArray(email) ? email : [];
    // validate provided emails exist (throws same message as original)
    await this.resolveUsersFromEmails(providedEmails);

    // Ensure creator exists
    const creator = await this.userService.fetchUserProfile(userId);
    if (!creator) {
      throw new BadRequestException(`Groups must have a valid creator`);
    }

    // Build a deduplicated list of emails including the creator
    const dedupSet = new Set<string>(
      providedEmails.map((e) => e.toLowerCase()),
    );
    dedupSet.add(creator.email.toLowerCase());
    const uniqueEmails = Array.from(dedupSet);

    if (uniqueEmails.length < 2) {
      throw new BadRequestException('At least one other member is required');
    }

    // Check if it is a group
    const isGroupResolved = Boolean(isGroup) || uniqueEmails.length > 2;

    const members = this.buildMemberCreates(
      uniqueEmails,
      creator.email,
      isGroupResolved,
    );

    // If this is a private convo (not a group), attempt to find an existing conversation with the exact same two participants
    if (!isGroupResolved) {
      // Resolve emails to user ids
      const users = await Promise.all(
        uniqueEmails.map((e) => this.userService.findOne(e)),
      );
      if (users.some((user) => !user)) {
        throw new BadRequestException('One or more users not found');
      }
      const userIds = users.map((user) => (user as any).id);

      const existing =
        await this.findExistingPrivateConversationForTwo(userIds);
      if (existing) {
        return await this.normalizeConversation(existing.id, userId);
      }
    }

    // Disallow creating group conversation without a group name
    if (isGroupResolved && !name) {
      throw new BadRequestException('Name is required to create a group');
    }

    // Disallow creating a group conversation with an initial message
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

    const newConversation = await this.prisma.conversation.create({
      data: convoData,
      include: { members: true, messages: true },
    });
    const messageIds = newConversation.messages.map((m) => m.id);

    const normConvo = await this.normalizeConversation(
      newConversation.id,
      userId,
    );
    return { ...normConvo, messageIds };
  }

  async findAllUserConversations(
    userId: string,
  ): Promise<ReturnConversationDto[]> {
    // Fetch conversations where the user is a member
    const conversations = await this.prisma.conversation.findMany({
      where: {
        members: {
          some: { userId: userId },
        },
      },
      include: {
        // include other members except the requesting user
        members: {
          where: { userId: { not: userId } },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile_image: true,
                full_name: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            status: true,
            createdAt: true,
            senderId: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return conversations.map((conversation) =>
      this.mapConversationForList(conversation),
    );
  }

  async getConversationName(
    conversationId: string,
    requesterId: string,
  ): Promise<string> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { userId: { not: requesterId } },
          include: {
            user: {
              select: {
                full_name: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (conversation?.isGroup) {
      return conversation.name as string;
    }
    return (
      (conversation?.members[0].user.full_name as string) ||
      (conversation?.members[0].user.email as string)
    );
  }

  async normalizeConversation(
    conversationId: string,
    userId: string,
  ): Promise<ReturnConversationDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: true,
        members: {
          include: {
            user: {
              select: {
                full_name: true,
                email: true,
                profile_image: true,
              },
            },
          },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    const latest = conversation.messages?.[0];
    const latestMessage = latest
      ? {
          content: latest.content,
          status: latest.status,
          createdAt: latest.createdAt,
          senderId: latest.senderId,
        }
      : { content: null, status: null, createdAt: null, senderId: null };
    const otherMembers = (conversation.members || [])
      .slice(0, 3)
      .map((member) => ({
        id: member.userId,
        email: member.user.email,
        profile_image: member.user.profile_image ?? null,
      }));

    const name = await this.getConversationName(conversation.id, userId);

    if (conversation.isGroup) {
      return {
        id: conversation.id,
        name,
        latestMessage,
        imageUrl: null,
        memberCount: conversation.members.length,
        members: otherMembers,
        isGroup: conversation.isGroup,
      };
    }
    let friendName: string | null = null;
    const other = conversation.members[0]?.user;
    friendName = other
      ? other.full_name
        ? other.full_name
        : other.email
      : null;
    return {
      id: conversation.id,
      name: friendName,
      latestMessage,
      imageUrl: (conversation as any).image_url,
      memberCount: conversation.members.length,
      members: otherMembers,
      isGroup: conversation.isGroup,
    };
  }
}
