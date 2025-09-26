import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UsersService } from 'src/users/users.service';

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

  async getOpenConversationMessages(id: string) {
    const result = await this.prisma.conversation.findUnique({
      where: { id },
      select: { messages: true },
    });
    return result?.messages;
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

    // Check if it is a group
    const isGroupResolved = Boolean(isGroup) || uniqueEmails.length > 2;

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
        const name = await this.getConversationName(existing.id, userId);
        return { ...existing, name }; // reuse existing private conversation
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
    const convoName = await this.getConversationName(
      newConversation.id,
      userId,
    );
    return { ...newConversation, name: convoName };
  }

  async findAllUserConversations(userId: string) {
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
          select: { content: true, status: true, createdAt: true },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Map to minimal shape expected by client
    const mappedConversation = conversations.map((conversation) => {
      const isGroup = conversation.isGroup;

      // Determine display name and imageUrl
      let name: string | null = null;
      let imageUrl: string | null = null;

      if (isGroup) {
        name = conversation.name || 'Group';
        imageUrl = null;
      } else {
        // private convo: members include only the other participant (we excluded the requester above)
        const other = conversation.members[0]?.user;
        name = other ? other.email : null;
        imageUrl = other ? (other.profile_image ?? null) : null;
      }

      const latest = conversation.messages?.[0];
      const latestMessage = latest
        ? { content: latest.content, status: latest.status }
        : { content: null, status: null };

      // memberCount from _count (total members in the conversation)
      const memberCount =
        (conversation as any)._count?.members ??
        conversation.members.length + 1;

      // preview of other members (up to 3)
      const otherMembers = (conversation.members || [])
        .slice(0, 3)
        .map((member) => ({
          email: member.user.email,
          profile_image: member.user.profile_image ?? null,
        }));

      return {
        id: conversation.id,
        name,
        latestMessage,
        imageUrl,
        memberCount,
        otherMembers,
        isGroup,
      };
    });

    return mappedConversation;
  }

  async getConversationName(conversationId: string, requesterId: string) {
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
      return conversation.name;
    }
    return (
      conversation?.members[0].user.full_name ||
      conversation?.members[0].user.email
    );
  }
}
