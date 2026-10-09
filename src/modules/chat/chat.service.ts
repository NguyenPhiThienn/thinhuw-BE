import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../gateways/events.gateway';
import { SendMessageDto, QueryMessagesDto, MarkReadDto } from './dto';
import { CoupleStatus, MessageStatus } from '@prisma/client';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  // ── Send Message ───────────────────────────────────────────────────────────

  async sendMessage(userId: string, dto: SendMessageDto) {
    const conversation = await this.getOrCreateConversation(userId);
    const partner = await this.findPartner(userId);

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: dto.content,
        type: dto.type || 'TEXT',
        status: partner ? MessageStatus.SENT : MessageStatus.SENT,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Notify partner via Socket.IO
    if (partner) {
      this.events.notifyChatMessage(partner.id, message);
    }

    return message;
  }

  // ── Get Messages (Paginated) ───────────────────────────────────────────────

  async getMessages(userId: string, query: QueryMessagesDto) {
    const conversation = await this.getOrCreateConversation(userId);
    const take = query.limit || 30;

    let cursorOptions = {};
    if (query.cursor) {
      cursorOptions = {
        cursor: { id: query.cursor },
        skip: 1,
      };
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...cursorOptions,
      include: {
        sender: {
          select: {
            id: true,
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        readStatuses: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
    });

    // Reverse so client receives chronological order if desired, or return with nextCursor
    const nextCursor = messages.length === take ? messages[messages.length - 1].id : null;

    return {
      messages: messages.reverse(),
      nextCursor,
    };
  }

  // ── Mark Messages Read ─────────────────────────────────────────────────────

  async markAsRead(userId: string, dto: MarkReadDto) {
    const conversation = await this.getOrCreateConversation(userId);
    const partner = await this.findPartner(userId);

    const whereClause: any = {
      conversationId: conversation.id,
      senderId: { not: userId },
      deletedAt: null,
    };

    if (dto.messageIds && dto.messageIds.length > 0) {
      whereClause.id = { in: dto.messageIds };
    }

    const unreadMessages = await this.prisma.message.findMany({
      where: whereClause,
      select: { id: true },
    });

    const now = new Date();
    for (const msg of unreadMessages) {
      await this.prisma.messageReadStatus.upsert({
        where: {
          messageId_userId: {
            messageId: msg.id,
            userId,
          },
        },
        create: {
          messageId: msg.id,
          userId,
          readAt: now,
        },
        update: {
          readAt: now,
        },
      });

      await this.prisma.message.update({
        where: { id: msg.id },
        data: { status: MessageStatus.READ },
      });
    }

    // Notify partner
    if (partner) {
      this.events.notifyMessageRead(partner.id, {
        messageIds: unreadMessages.map((m) => m.id),
        allRead: !dto.messageIds || dto.messageIds.length === 0,
      });
    }

    return { markedCount: unreadMessages.length };
  }

  // ── Soft Delete Message ───────────────────────────────────────────────────

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Message deleted successfully' };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOrCreateConversation(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: {
        couple: {
          include: {
            conversation: true,
          },
        },
      },
    });

    if (!member || member.couple.status !== CoupleStatus.ACTIVE) {
      throw new ForbiddenException('You must be in an active couple to chat');
    }

    if (member.couple.conversation) {
      return member.couple.conversation;
    }

    // Create conversation if not exists
    return this.prisma.conversation.create({
      data: {
        coupleId: member.coupleId,
      },
    });
  }

  private async findPartner(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: {
        couple: {
          include: {
            members: {
              where: { userId: { not: userId } },
              include: {
                user: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!member || member.couple.status !== CoupleStatus.ACTIVE) {
      return null;
    }

    return member.couple.members[0]?.user || null;
  }
}
