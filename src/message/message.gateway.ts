import { UseGuards } from '@nestjs/common';
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

@UseGuards(AuthGuard)
@WebSocketGateway({ cors: { origin: '*' } })
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Map userId ==> socketId
  private userSocketMap = new Map<string, string>();

  // Map groupId ==> Set<userId>
  private groupMembers = new Map<string, Set<string>>();

  constructor(
    private readonly userService: UsersService,
    private readonly messageService: MessageService,
  ) {}

  async handleConnection(client: Socket) {
    const user = client.user;
    if (user?.sub) {
      this.userSocketMap.set(user.sub, client.id);
      await this.userService.setPresence(user.sub, true);
      console.log(`User ${user.sub} connected with socket ${client.id}`);

      // Optional: broadcast presence
      this.server.emit('presence', { userId: user.sub, online: true });
    } else {
      console.log('Connection without user payload, disconnecting...');
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
