import { UseGuards, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthGuard } from 'src/auth/auth.guard';
import { UsersService } from 'src/users/users.service';
import { MessageService } from './message.service';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from 'src/auth/constants';
import { appConstants } from 'src/auth/constants';
import { CreateConversationDto } from './dto/create-conversation.dto';

@UseGuards(AuthGuard)
@WebSocketGateway({
  cors: { origin: appConstants.allowedOrigins, credentials: true },
})
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Map userId ==> socketId
  private userSocketMap = new Map<string, string>();

  // Map groupId ==> Set<userId>
  private groupMembers = new Map<string, Set<string>>();

  private readonly logger = new Logger(MessageGateway.name);

  constructor(
    private readonly userService: UsersService,
    private readonly messageService: MessageService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    // Try to get token from handshake auth/header/query
    const headerAuth = client.handshake?.headers?.authorization;
    let token: string | undefined;
    if (headerAuth) {
      const [, t] = headerAuth.split(' ');
      token = t;
    }
    if (!token && client.handshake?.auth?.token) {
      const [, t] = client.handshake.auth.token.split(' ');
      token = t;
    }
    if (!token && client.handshake?.query?.token) {
      token = client.handshake.query.token as string | undefined;
    }

    this.logger.log(`New client connected: ${client.id}`);

    if (!token) {
      this.logger.warn('No token provided, disconnecting...');
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      // attach payload
      (client as any).user = payload;
      this.logger.log(`User ${payload.sub} connected with socket ${client.id}`);

      // normal connection flow
      this.userSocketMap.set(payload.sub, client.id);
      await this.userService.setPresence(payload.sub, true);
      this.server.emit('presence', { userId: payload.sub, online: true });
    } catch (err) {
      this.logger.warn('Invalid token, disconnecting...', err as any);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.user;
    if (user?.sub) {
      this.userSocketMap.delete(user.sub);
      await this.userService.setPresence(user.sub, false);
      console.log(`User ${user.sub} disconnected`);

      // Optional: broadcast user presence
      this.server.emit('presence', { userId: user.sub, online: false });
    }
  }

  // Public chat/broadcast
  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: { text: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.sub;
    this.server.emit('message', {
      from: userId,
      text: data.text,
      timestamp: new Date(),
    });
  }

  // Private message
  @SubscribeMessage('private-message')
  handlePrivateMessage(
    @MessageBody() data: { to: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    const from = client.user?.sub;
    const socketId = this.userSocketMap.get(data.to);
    if (socketId) {
      this.server.to(socketId).emit('private-message', {
        from,
        text: data.text,
        timestamp: new Date(),
      });
    }
  }

  // Join a conversation room
  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.sub as string;
    if (!userId) return;
    client.join(data.conversationId);
    this.logger.log(
      `User ${userId} joined conversation ${data.conversationId}`,
    );
  }

  // New conversation
  @SubscribeMessage('create-conversation')
  async handleNewConversation(
    @MessageBody() data: CreateConversationDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.sub as string;
    if (!userId) return { status: 'error', error: 'Unauthorized' };

    console.log('REACHEDHERE');
    console.log('user data', data);

    // Persist conversation
    const conversation = await this.messageService.createConversation(
      data,
      userId,
    );

    client.join(conversation.id);

    const participantsId = conversation.members.map((conversationMember) => ({
      id: conversationMember.userId,
    }));

    // Notify all participants individually
    for (const participant of participantsId) {
      // don't emit back to the creator
      if (participant.id !== userId) {
        const socketId = this.userSocketMap.get(participant.id);
        console.log('SocketId', socketId);
        if (socketId) {
          this.server.to(socketId).emit('new-conversation', conversation);
        }
      }
    }

    // Also broadcast to conversation room
    //this.server.to(conversation.id).emit('new-conversation', conversation);

    // Ack back to sender
    return { status: 'ok', conversation };
  }

  // Send a message to a conversation
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @MessageBody()
    data: {
      conversationId: string;
      message: { clientId: string; content: string };
    },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.user?.sub as string;
    if (!senderId) return;

    // Persist message
    try {
      const saved = await this.messageService.create({
        conversationId: data.conversationId,
        content: data.message.content,
        senderId,
      } as any);

      // Broadcast to conversation room
      this.server.to(data.conversationId).emit('new-message', saved);
      // Ack back to sender
      return { status: 'ok', clientId: data.message.clientId, message: saved };
    } catch (err: any) {
      this.logger.error('Failed to save message', err?.message || err);
      // return error with message
      return { status: 'error', error: err?.message || 'Failed to save' };
    }
  }

  // Join group
  @SubscribeMessage('join-group')
  handleJoinGroup(
    @MessageBody() data: { groupId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.sub as string;

    if (!this.groupMembers.has(data.groupId)) {
      this.groupMembers.set(data.groupId, new Set());
    }
    this.groupMembers.get(data.groupId)?.add(userId);

    client.join(data.groupId); // socket.io rooms
    console.log(`User ${userId} joined group ${data.groupId}`);

    this.server.to(data.groupId).emit('group-event', {
      type: 'join',
      userId,
      groupId: data.groupId,
    });
  }

  // Leave group
  @SubscribeMessage('leave-group')
  handleLeaveGroup(
    @MessageBody() data: { groupId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.sub;

    this.groupMembers.get(data.groupId)?.delete(userId as string); // userId may be undefined: fix later
    client.leave(data.groupId);

    console.log(`User ${userId} left group ${data.groupId}`);

    this.server.to(data.groupId).emit('group-event', {
      type: 'leave',
      userId,
      groupId: data.groupId,
    });
  }

  // Send message to group
  @SubscribeMessage('group-message')
  handleGroupMessage(
    @MessageBody() data: { groupId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.user?.sub;
    this.server.to(data.groupId).emit('group-message', {
      from: userId,
      groupId: data.groupId,
      text: data.text,
      timestamp: new Date(),
    });
  }

  // Utility: Send to a specific user (programmatic)
  sendMessageToUser(userId: string, message: any) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('new-message', message);
    }
  }
}
