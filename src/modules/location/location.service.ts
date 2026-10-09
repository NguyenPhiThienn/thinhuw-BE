import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../gateways/events.gateway';
import {
  UpdateLocationDto,
  UpdateLocationSettingDto,
  LocationHistoryQueryDto,
} from './dto';
import { CoupleStatus, LocationSharingStatus, MovementStatus } from '@prisma/client';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  // ── Update Location ────────────────────────────────────────────────────────

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    // 1. Upsert current location
    const location = await this.prisma.location.upsert({
      where: { userId },
      create: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        altitude: dto.altitude,
        speed: dto.speed,
        heading: dto.heading,
        battery: dto.battery,
        movementStatus: dto.movementStatus ?? MovementStatus.STATIONARY,
        isCharging: dto.isCharging,
        address: dto.address,
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        altitude: dto.altitude,
        speed: dto.speed,
        heading: dto.heading,
        battery: dto.battery,
        movementStatus: dto.movementStatus ?? MovementStatus.STATIONARY,
        isCharging: dto.isCharging,
        address: dto.address,
      },
    });

    // 2. Fetch user's sharing settings
    const setting = await this.getOrCreateSetting(userId);

    // 3. If sharing is enabled, record history & broadcast to partner
    if (setting.isSharing) {
      await this.prisma.locationHistory.create({
        data: {
          userId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          altitude: dto.altitude,
          speed: dto.speed,
          heading: dto.heading,
          battery: dto.battery,
          movementStatus: dto.movementStatus ?? MovementStatus.STATIONARY,
        },
      });

      // Find partner
      const partner = await this.findPartner(userId);
      if (partner) {
        // Sanitize data according to user's privacy settings
        const payload = {
          userId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          altitude: dto.altitude,
          speed: setting.shareSpeed ? dto.speed : null,
          heading: dto.heading,
          battery: setting.shareBattery ? dto.battery : null,
          movementStatus: setting.shareMovement ? dto.movementStatus : null,
          isCharging: setting.shareBattery ? dto.isCharging : null,
          address: dto.address,
          updatedAt: location.updatedAt,
        };

        this.events.notifyLocationUpdate(partner.id, payload);
      }
    }

    return location;
  }

  // ── Get Partner Location ───────────────────────────────────────────────────

  async getPartnerLocation(userId: string) {
    const partner = await this.findPartner(userId);
    if (!partner) {
      throw new NotFoundException('You do not have an active partner');
    }

    const partnerSetting = await this.getOrCreateSetting(partner.id);
    if (!partnerSetting.isSharing) {
      return {
        isSharing: false,
        status: partnerSetting.status,
        partnerId: partner.id,
        partnerName: partner.profile?.displayName || 'Người yêu',
        location: null,
      };
    }

    const loc = await this.prisma.location.findUnique({
      where: { userId: partner.id },
    });

    if (!loc) {
      return {
        isSharing: true,
        status: partnerSetting.status,
        partnerId: partner.id,
        partnerName: partner.profile?.displayName || 'Người yêu',
        location: null,
      };
    }

    return {
      isSharing: true,
      status: partnerSetting.status,
      partnerId: partner.id,
      partnerName: partner.profile?.displayName || 'Người yêu',
      location: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        altitude: loc.altitude,
        speed: partnerSetting.shareSpeed ? loc.speed : null,
        heading: loc.heading,
        battery: partnerSetting.shareBattery ? loc.battery : null,
        movementStatus: partnerSetting.shareMovement ? loc.movementStatus : null,
        isCharging: partnerSetting.shareBattery ? loc.isCharging : null,
        address: loc.address,
        updatedAt: loc.updatedAt,
      },
    };
  }

  // ── Get & Update Sharing Settings ──────────────────────────────────────────

  async getSharingSetting(userId: string) {
    return this.getOrCreateSetting(userId);
  }

  async updateSharingSetting(userId: string, dto: UpdateLocationSettingDto) {
    const setting = await this.prisma.locationSharingSetting.upsert({
      where: { userId },
      create: {
        userId,
        isSharing: dto.isSharing ?? false,
        status: dto.status ?? (dto.isSharing ? LocationSharingStatus.SHARING : LocationSharingStatus.STOPPED),
        shareMovement: dto.shareMovement ?? true,
        shareBattery: dto.shareBattery ?? true,
        shareSpeed: dto.shareSpeed ?? true,
        stopDetection: dto.stopDetection ?? true,
        stopMinutes: dto.stopMinutes ?? 10,
        batteryAlerts: dto.batteryAlerts ?? true,
        batteryThreshold: dto.batteryThreshold ?? 20,
      },
      update: {
        isSharing: dto.isSharing,
        status: dto.status ?? (dto.isSharing !== undefined ? (dto.isSharing ? LocationSharingStatus.SHARING : LocationSharingStatus.STOPPED) : undefined),
        shareMovement: dto.shareMovement,
        shareBattery: dto.shareBattery,
        shareSpeed: dto.shareSpeed,
        stopDetection: dto.stopDetection,
        stopMinutes: dto.stopMinutes,
        batteryAlerts: dto.batteryAlerts,
        batteryThreshold: dto.batteryThreshold,
      },
    });

    // Notify partner
    const partner = await this.findPartner(userId);
    if (partner) {
      this.events.notifyPartnerStatus(partner.id, {
        isSharing: setting.isSharing,
        status: setting.status,
        timestamp: new Date().toISOString(),
      });
    }

    return setting;
  }

  // ── History ────────────────────────────────────────────────────────────────

  async getHistory(userId: string, query: LocationHistoryQueryDto) {
    let targetUserId = userId;

    if (query.partner) {
      const partner = await this.findPartner(userId);
      if (!partner) {
        throw new NotFoundException('Partner not found');
      }
      const partnerSetting = await this.getOrCreateSetting(partner.id);
      if (!partnerSetting.isSharing) {
        throw new ForbiddenException('Partner has disabled location sharing');
      }
      targetUserId = partner.id;
    }

    const whereClause: any = { userId: targetUserId };
    if (query.from || query.to) {
      whereClause.recordedAt = {};
      if (query.from) whereClause.recordedAt.gte = new Date(query.from);
      if (query.to) whereClause.recordedAt.lte = new Date(query.to);
    }

    return this.prisma.locationHistory.findMany({
      where: whereClause,
      orderBy: { recordedAt: 'desc' },
      take: query.limit || 100,
    });
  }

  async deleteHistory(userId: string) {
    const result = await this.prisma.locationHistory.deleteMany({
      where: { userId },
    });
    return { count: result.count, message: 'Location history cleared successfully' };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOrCreateSetting(userId: string) {
    let setting = await this.prisma.locationSharingSetting.findUnique({
      where: { userId },
    });

    if (!setting) {
      setting = await this.prisma.locationSharingSetting.create({
        data: {
          userId,
          isSharing: false,
          status: LocationSharingStatus.OFFLINE,
        },
      });
    }

    return setting;
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
