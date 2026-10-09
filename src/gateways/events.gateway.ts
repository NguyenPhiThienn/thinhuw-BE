import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client connection rejected: No token provided (${client.id})`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, isActive: true, deletedAt: null },
        include: {
          coupleMember: true,
        },
      });

      if (!user) {
        this.logger.warn(`Client connection rejected: User not found (${client.id})`);
        client.disconnect();
        return;
      }

      client.data.userId = user.id;
      client.data.coupleId = user.coupleMember?.coupleId;

      // Join individual user room
      client.join(`user_${user.id}`);

      // Join couple room if paired
      if (user.coupleMember?.coupleId) {
        client.join(`couple_${user.coupleMember.coupleId}`);
      }

      this.logger.log(`Client connected: user_${user.id} (${client.id})`);
    } catch (err) {
      this.logger.warn(`Client auth failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id} (user: ${client.data?.userId})`);
  }

  // ── Outgoing Notifications ──────────────────────────────────────────────────

  notifyPairingRequest(creatorId: string, payload: any) {
    this.server.to(`user_${creatorId}`).emit('pairing:request', payload);
  }

  notifyPairingSuccess(user1Id: string, user2Id: string, payload: any) {
    this.server.to(`user_${user1Id}`).emit('pairing:success', payload);
    this.server.to(`user_${user2Id}`).emit('pairing:success', payload);
  }

  notifyCoupleDisconnected(partnerId: string) {
    this.server.to(`user_${partnerId}`).emit('pairing:dissolved', {
      timestamp: new Date().toISOString(),
    });
  }

  notifyLocationUpdate(partnerId: string, locationData: any) {
    this.server.to(`user_${partnerId}`).emit('location:partner', locationData);
  }

  notifyPartnerStatus(partnerId: string, statusData: any) {
    this.server.to(`user_${partnerId}`).emit('location:partner_status', statusData);
  }

  notifyChatMessage(recipientId: string, messageData: any) {
    this.server.to(`user_${recipientId}`).emit('chat:message', messageData);
  }

  notifyTyping(recipientId: string, data: { isTyping: boolean }) {
    this.server.to(`user_${recipientId}`).emit('chat:typing', data);
  }

  notifyMessageRead(
    partnerId: string,
    data: { messageId?: string; messageIds?: string[]; allRead?: boolean },
  ) {
    this.server.to(`user_${partnerId}`).emit('chat:read', data);
  }

  notifySosAlert(partnerId: string, alertData: any) {
    this.server.to(`user_${partnerId}`).emit('safety:sos', alertData);
  }

  notifySosResolved(partnerId: string, alertData: any) {
    this.server.to(`user_${partnerId}`).emit('safety:sos_resolved', alertData);
  }

  notifyAvatarUpdated(partnerId: string, payload: { userId: string; avatarUrl: string }) {
    this.server.to(`user_${partnerId}`).emit('user:avatar_updated', payload);
  }

  notifyAnniversaryUpdated(partnerId: string, payload: { coupleId: string; pairedAt: string }) {
    this.server.to(`user_${partnerId}`).emit('couple:anniversary_updated', payload);
  }

  notifyStopUpdated(partnerId: string, payload: any) {
    this.server.to(`user_${partnerId}`).emit('activity:stop_updated', payload);
  }

  // ── Inbound Socket Events ───────────────────────────────────────────────────

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isTyping: boolean },
  ) {
    const userId = client.data?.userId;
    const coupleId = client.data?.coupleId;
    if (coupleId) {
      client.to(`couple_${coupleId}`).emit('chat:typing', {
        userId,
        isTyping: !!data?.isTyping,
      });
    }
  }

  @SubscribeMessage('location:status')
  handleLocationStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isSharing: boolean },
  ) {
    const coupleId = client.data?.coupleId;
    if (coupleId) {
      client.to(`couple_${coupleId}`).emit('location:partner_status', {
        userId: client.data?.userId,
        isSharing: data?.isSharing,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('safety:sos')
  handleSos(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const coupleId = client.data?.coupleId;
    if (coupleId) {
      client.to(`couple_${coupleId}`).emit('safety:sos', {
        creatorId: client.data?.userId,
        status: 'ACTIVE',
        timestamp: new Date().toISOString(),
        ...data,
      });
    }
  }

  @SubscribeMessage('safety:sos_resolved')
  handleSosResolved(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const coupleId = client.data?.coupleId;
    if (coupleId) {
      client.to(`couple_${coupleId}`).emit('safety:sos_resolved', {
        creatorId: client.data?.userId,
        status: 'RESOLVED',
        timestamp: new Date().toISOString(),
        ...data,
      });
    }
  }

  private extractToken(client: Socket): string | undefined {
    // 1. Check handshake auth
    const authHeader = client.handshake.auth?.token;
    if (authHeader) {
      return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    }

    // 2. Check query params
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') {
      return queryToken;
    }

    // 3. Check headers
    const header = client.handshake.headers?.authorization;
    if (header) {
      return header.startsWith('Bearer ') ? header.substring(7) : header;
    }

    return undefined;
  }
}
