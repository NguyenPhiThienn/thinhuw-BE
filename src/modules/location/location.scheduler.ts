import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EventsGateway } from '../../gateways/events.gateway';
import { LocationSharingStatus, MovementStatus } from '@prisma/client';

@Injectable()
export class LocationScheduler {
  private readonly logger = new Logger(LocationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly events: EventsGateway,
  ) {}

  /**
   * Run every 2 minutes: clean up location history older than 7 days
   */
  @Cron('0 */2 * * * *')
  async cleanupOldLocationHistory() {
    const retentionDays = this.configService.get<number>(
      'LOCATION_HISTORY_DAYS',
      7,
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.prisma.locationHistory.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned ${result.count} old location history records`);
    }
  }

  /**
   * Run every minute: detect stops and notify partners
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async detectStopsAndNotify() {
    const stopThresholdMins = this.configService.get<number>(
      'STOP_DETECTION_MINUTES',
      10,
    );
    const minDistanceMeters = this.configService.get<number>(
      'STOP_MIN_DISTANCE_METERS',
      50,
    );

    // Find users who are sharing location and stationary
    const sharingUsers = await this.prisma.locationSharingSetting.findMany({
      where: {
        isSharing: true,
        status: LocationSharingStatus.SHARING,
        stopDetection: true,
      },
      include: {
        user: {
          include: {
            currentLocation: true,
            coupleMember: {
              include: {
                couple: {
                  include: {
                    members: {
                      include: {
                        user: {
                          select: { id: true },
                        },
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

    for (const setting of sharingUsers) {
      const user = setting.user;
      const location = user.currentLocation;
      const couple = user.coupleMember?.couple;

      if (!location || !couple) continue;

      // Check if user is stationary
      if (location.movementStatus !== MovementStatus.STATIONARY) {
        // User is moving — check if they left a stop
        await this.handleStopLeft(user.id, couple.id, location);
        continue;
      }

      // Find partner
      const partner = couple.members.find((m) => m.userId !== user.id);
      if (!partner) continue;

      // Check if there's an open stop event
      const openStop = await this.prisma.stopEvent.findFirst({
        where: {
          userId: user.id,
          coupleId: couple.id,
          leftAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!openStop) {
        // Start tracking a new potential stop
        const stopThreshold = new Date();
        stopThreshold.setMinutes(stopThreshold.getMinutes() - stopThresholdMins);

        // Check if user has been stationary at roughly same location
        const recentHistory = await this.prisma.locationHistory.findFirst({
          where: {
            userId: user.id,
            movementStatus: MovementStatus.STATIONARY,
            recordedAt: { lte: stopThreshold },
          },
          orderBy: { recordedAt: 'desc' },
        });

        if (recentHistory) {
          const distance = this.haversineDistance(
            location.latitude,
            location.longitude,
            recentHistory.latitude,
            recentHistory.longitude,
          );

          if (distance < minDistanceMeters) {
            // User has been at this location for stop threshold — create stop event
            await this.prisma.stopEvent.create({
              data: {
                userId: user.id,
                coupleId: couple.id,
                notifiedId: partner.userId,
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address,
                startedAt: recentHistory.recordedAt,
              },
            });

            this.logger.debug(
              `Stop detected for user ${user.id} at (${location.latitude}, ${location.longitude})`,
            );
          }
        }
      }
    }
  }

  private async handleStopLeft(
    userId: string,
    coupleId: string,
    location: any,
  ) {
    const openStop = await this.prisma.stopEvent.findFirst({
      where: {
        userId,
        coupleId,
        leftAt: null,
        notified: false,
      },
      include: {
        user: {
          include: { profile: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!openStop) return;

    const distance = this.haversineDistance(
      location.latitude,
      location.longitude,
      openStop.latitude,
      openStop.longitude,
    );

    const minDistanceMeters = this.configService.get<number>(
      'STOP_MIN_DISTANCE_METERS',
      50,
    );

    if (distance > minDistanceMeters) {
      const leftAt = new Date();
      const durationMins = Math.round(
        (leftAt.getTime() - openStop.startedAt.getTime()) / 60000,
      );

      await this.prisma.stopEvent.update({
        where: { id: openStop.id },
        data: {
          leftAt,
          durationMins,
          notified: true,
          notifiedAt: leftAt,
        },
      });

      const userName =
        openStop.user.profile?.displayName || 'Người yêu của bạn';

      // Create in-app notification
      await this.prisma.notification.create({
        data: {
          userId: openStop.notifiedId,
          type: 'PARTNER_LEFT_STOP',
          title: `${userName} đã rời điểm dừng`,
          body: `${userName} đã rời khỏi điểm dừng sau ${durationMins} phút.`,
          data: {
            coupleId,
            stopId: openStop.id,
            latitude: openStop.latitude,
            longitude: openStop.longitude,
          },
        },
      });

      // Emit real-time notification
      this.events.notifyPartnerStatus(openStop.notifiedId, {
        type: 'stop:left',
        userId,
        userName,
        durationMins,
        latitude: openStop.latitude,
        longitude: openStop.longitude,
        address: openStop.address,
        timestamp: leftAt.toISOString(),
      });

      this.logger.log(
        `User ${userId} left stop after ${durationMins} mins, partner ${openStop.notifiedId} notified`,
      );
    }
  }

  /**
   * Haversine distance in meters
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
