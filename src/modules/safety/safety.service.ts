import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../gateways/events.gateway';
import { TriggerSosDto } from './dto';
import { CoupleStatus, SafetyAlertStatus, NotificationType } from '@prisma/client';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  // ── Trigger SOS ────────────────────────────────────────────────────────────

  async triggerSos(userId: string, dto: TriggerSosDto) {
    const { couple, partner } = await this.getCoupleAndPartner(userId);

    // Cancel existing active alerts
    await this.prisma.safetyAlert.updateMany({
      where: {
        coupleId: couple.id,
        status: { in: [SafetyAlertStatus.ACTIVE, SafetyAlertStatus.ACKNOWLEDGED] },
      },
      data: { status: SafetyAlertStatus.CANCELLED, cancelledAt: new Date() },
    });

    // Create new alert
    const alert = await this.prisma.safetyAlert.create({
      data: {
        coupleId: couple.id,
        creatorId: userId,
        recipientId: partner.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        message: dto.message || 'Cảnh báo khẩn cấp SOS được kích hoạt!',
        status: SafetyAlertStatus.ACTIVE,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    // Send push notification record to partner
    await this.prisma.notification.create({
      data: {
        userId: partner.id,
        type: NotificationType.SOS_ALERT,
        title: '🚨 KHẨN CẤP: Báo động SOS!',
        body: `${alert.creator.profile?.displayName || 'Người yêu'} vừa kích hoạt báo động khẩn cấp!`,
        data: { alertId: alert.id, latitude: dto.latitude, longitude: dto.longitude },
      },
    });

    // Notify partner via Socket.IO
    this.events.notifySosAlert(partner.id, alert);

    this.logger.warn(`SOS Alert triggered by user ${userId} in couple ${couple.id}`);
    return alert;
  }

  // ── Acknowledge SOS ────────────────────────────────────────────────────────

  async acknowledgeSos(userId: string, alertId: string) {
    const alert = await this.prisma.safetyAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.recipientId !== userId) {
      throw new ForbiddenException('Only recipient can acknowledge the alert');
    }

    const updated = await this.prisma.safetyAlert.update({
      where: { id: alertId },
      data: {
        status: SafetyAlertStatus.ACKNOWLEDGED,
        ackedAt: new Date(),
      },
    });

    // Notify creator that partner received the SOS
    this.events.notifySosAlert(alert.creatorId, {
      ...updated,
      event: 'acknowledged',
    });

    return updated;
  }

  // ── Resolve SOS ────────────────────────────────────────────────────────────

  async resolveSos(userId: string, alertId: string) {
    const alert = await this.prisma.safetyAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creatorId !== userId) {
      throw new ForbiddenException('Chỉ người kích hoạt cảnh báo SOS mới có quyền tắt!');
    }

    const updated = await this.prisma.safetyAlert.update({
      where: { id: alertId },
      data: {
        status: SafetyAlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });

    this.events.notifySosResolved(alert.creatorId, updated);
    this.events.notifySosResolved(alert.recipientId, updated);

    return updated;
  }

  // ── Cancel SOS ─────────────────────────────────────────────────────────────

  async cancelSos(userId: string, alertId: string) {
    const alert = await this.prisma.safetyAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.creatorId !== userId) {
      throw new ForbiddenException('Only alert creator can cancel');
    }

    const updated = await this.prisma.safetyAlert.update({
      where: { id: alertId },
      data: {
        status: SafetyAlertStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    this.events.notifySosResolved(alert.creatorId, updated);
    this.events.notifySosResolved(alert.recipientId, updated);
    return updated;
  }

  // ── Get Active Alert ───────────────────────────────────────────────────────

  async getActiveAlert(userId: string) {
    const { couple } = await this.getCoupleAndPartner(userId);

    return this.prisma.safetyAlert.findFirst({
      where: {
        coupleId: couple.id,
        status: { in: [SafetyAlertStatus.ACTIVE, SafetyAlertStatus.ACKNOWLEDGED] },
      },
      include: {
        creator: {
          select: {
            id: true,
            profile: {
              select: { displayName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { activatedAt: 'desc' },
    });
  }

  // ── Get Alert History ──────────────────────────────────────────────────────

  async getAlertHistory(userId: string) {
    const { couple } = await this.getCoupleAndPartner(userId);

    return this.prisma.safetyAlert.findMany({
      where: { coupleId: couple.id },
      orderBy: { activatedAt: 'desc' },
      take: 50,
    });
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private async getCoupleAndPartner(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: {
        couple: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, email: true, profile: true },
                },
              },
            },
          },
        },
      },
    });

    if (!member || member.couple.status !== CoupleStatus.ACTIVE) {
      throw new ForbiddenException('You must be in an active couple to use safety features');
    }

    const partnerMember = member.couple.members.find((m) => m.userId !== userId);
    if (!partnerMember) {
      throw new NotFoundException('Partner not found in couple');
    }

    return { couple: member.couple, partner: partnerMember.user };
  }
}
