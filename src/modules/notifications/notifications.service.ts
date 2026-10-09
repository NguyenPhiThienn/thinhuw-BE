import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdateNotificationSettingDto,
  QueryNotificationsDto,
} from './dto';
import { NotificationType, NotificationChannel } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Query Notifications ───────────────────────────────────────────────────

  async getNotifications(userId: string, query: QueryNotificationsDto) {
    const whereClause: any = { userId };
    if (query.unreadOnly) {
      whereClause.isRead = false;
    }

    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: query.limit || 20,
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return { items, unreadCount };
  }

  // ── Mark as Read ──────────────────────────────────────────────────────────

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { markedCount: result.count };
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  async getSettings(userId: string) {
    let settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.notificationSetting.create({
        data: { userId },
      });
    }

    return settings;
  }

  async updateSettings(userId: string, dto: UpdateNotificationSettingDto) {
    return this.prisma.notificationSetting.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: {
        ...dto,
      },
    });
  }

  // ── Internal Helper to push in-app notification ───────────────────────────

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: any,
    channel: NotificationChannel = NotificationChannel.IN_APP,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        channel,
        title,
        body,
        data: data || undefined,
      },
    });
  }
}
