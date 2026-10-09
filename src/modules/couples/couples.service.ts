import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PairingCodeStatus, PairingRequestStatus, CoupleStatus } from '@prisma/client';
import { EventsGateway } from '../../gateways/events.gateway';

@Injectable()
export class CouplesService {
  private readonly logger = new Logger(CouplesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  // ── Create Pairing Code ────────────────────────────────────────────────────

  async createPairingCode(userId: string) {
    // Check if user is already in an active couple
    const existingMember = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: { couple: true },
    });

    if (existingMember?.couple?.status === CoupleStatus.ACTIVE) {
      throw new ConflictException('Bạn đang trong một mối quan hệ, không thể tạo mã ghép đôi mới');
    }

    // Cancel any existing active codes for this user
    await this.prisma.pairingCode.updateMany({
      where: { creatorId: userId, status: PairingCodeStatus.ACTIVE },
      data: { status: PairingCodeStatus.CANCELLED, cancelledAt: new Date() },
    });

    // Generate unique 8-char code
    const code = await this.generateUniqueCode();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    const pairingCode = await this.prisma.pairingCode.create({
      data: {
        creatorId: userId,
        code,
        expiresAt,
      },
    });

    return {
      code: pairingCode.code,
      expiresAt: pairingCode.expiresAt,
      status: pairingCode.status,
    };
  }

  // ── Join with Code ─────────────────────────────────────────────────────────

  async joinWithCode(userId: string, code: string) {
    // Check if requester is already in an active couple
    const existingMember = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: { couple: true },
    });

    if (existingMember?.couple?.status === CoupleStatus.ACTIVE) {
      throw new ConflictException('Bạn đang trong một mối quan hệ, không thể ghép đôi với người khác');
    }

    // Find pairing code
    const pairingCode = await this.prisma.pairingCode.findFirst({
      where: {
        code: code.toUpperCase(),
        status: PairingCodeStatus.ACTIVE,
      },
      include: { creator: { select: { id: true, profile: true } } },
    });

    if (!pairingCode) {
      throw new NotFoundException('Mã kết nối không hợp lệ hoặc đã hết hạn');
    }

    if (pairingCode.expiresAt < new Date()) {
      await this.prisma.pairingCode.update({
        where: { id: pairingCode.id },
        data: { status: PairingCodeStatus.EXPIRED },
      });
      throw new BadRequestException('Mã kết nối đã hết hạn');
    }

    if (pairingCode.creatorId === userId) {
      throw new BadRequestException('Bạn không thể tự kết nối với chính mình');
    }

    // Check if the code creator is already in an active couple
    const creatorMember = await this.prisma.coupleMember.findUnique({
      where: { userId: pairingCode.creatorId },
      include: { couple: true },
    });

    if (creatorMember?.couple?.status === CoupleStatus.ACTIVE) {
      await this.prisma.pairingCode.update({
        where: { id: pairingCode.id },
        data: { status: PairingCodeStatus.CANCELLED, cancelledAt: new Date() },
      });
      throw new ConflictException('Người tạo mã này hiện đã ghép đôi với người khác');
    }

    // Create or update pairing request
    const existingRequest = await this.prisma.pairingRequest.findUnique({
      where: { pairingCodeId: pairingCode.id },
    });

    if (existingRequest && existingRequest.status === PairingRequestStatus.PENDING) {
      throw new ConflictException('Mã này đang có một yêu cầu kết nối chờ xử lý');
    }

    const requestExpiresAt = new Date();
    requestExpiresAt.setMinutes(requestExpiresAt.getMinutes() + 30);

    const request = await this.prisma.pairingRequest.upsert({
      where: { pairingCodeId: pairingCode.id },
      create: {
        pairingCodeId: pairingCode.id,
        requesterId: userId,
        expiresAt: requestExpiresAt,
        status: PairingRequestStatus.PENDING,
      },
      update: {
        requesterId: userId,
        expiresAt: requestExpiresAt,
        status: PairingRequestStatus.PENDING,
      },
    });

    // Notify code creator via socket
    this.events.notifyPairingRequest(pairingCode.creatorId, {
      requestId: request.id,
      requesterId: userId,
      code: pairingCode.code,
    });

    return {
      requestId: request.id,
      message: 'Pairing request sent. Waiting for confirmation.',
      creatorName: pairingCode.creator.profile?.displayName || 'Người ấy',
    };
  }

  // ── Accept Pairing ─────────────────────────────────────────────────────────

  async acceptPairing(userId: string, requestId: string) {
    const request = await this.prisma.pairingRequest.findFirst({
      where: { id: requestId, status: PairingRequestStatus.PENDING },
      include: {
        pairingCode: {
          include: { creator: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Yêu cầu kết nối không tồn tại hoặc đã được xử lý');
    }

    // Only the code creator can accept
    if (request.pairingCode.creatorId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chấp nhận yêu cầu này');
    }

    if (request.expiresAt < new Date()) {
      await this.prisma.pairingRequest.update({
        where: { id: request.id },
        data: { status: PairingRequestStatus.EXPIRED },
      });
      throw new BadRequestException('Yêu cầu kết nối đã hết hạn');
    }

    const creatorId = request.pairingCode.creatorId;
    const requesterId = request.requesterId;

    // Verify neither user is already in an active couple
    const activeMembers = await this.prisma.coupleMember.findMany({
      where: {
        userId: { in: [creatorId, requesterId] },
        couple: { status: CoupleStatus.ACTIVE },
      },
    });

    if (activeMembers.length > 0) {
      throw new ConflictException('Một trong hai người hiện đã ghép đôi với người khác');
    }

    // Create couple (transaction)
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Tạo cặp đôi với đầy đủ lịch sử ghép đôi
      const couple = await tx.couple.create({
        data: {
          status: CoupleStatus.ACTIVE,
          user1Id: creatorId,
          user2Id: requesterId,
          pairingCode: request.pairingCode.code,
          members: {
            create: [
              { userId: creatorId },
              { userId: requesterId },
            ],
          },
          conversation: {
            create: {},
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  profile: true,
                },
              },
            },
          },
          conversation: true,
        },
      });

      // 2. Cập nhật trạng thái yêu cầu ghép đôi thành ACCEPTED
      await tx.pairingRequest.update({
        where: { id: request.id },
        data: {
          status: PairingRequestStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      // 3. Đánh dấu mã đã sử dụng, lưu lại người đã kết nối (usedBy)
      await tx.pairingCode.update({
        where: { id: request.pairingCodeId },
        data: {
          status: PairingCodeStatus.USED,
          usedAt: new Date(),
          usedBy: requesterId,
        },
      });

      // 4. NGHIỆP VỤ: Cả người tạo và người accept không được tạo mã nào khác nữa
      // Hủy mọi mã ACTIVE khác do 2 người này đã tạo trước đó
      await tx.pairingCode.updateMany({
        where: {
          creatorId: { in: [creatorId, requesterId] },
          status: PairingCodeStatus.ACTIVE,
        },
        data: {
          status: PairingCodeStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      // 5. Hủy tất cả các yêu cầu kết nối đang chờ xử lý khác của cả 2 người
      await tx.pairingRequest.updateMany({
        where: {
          requesterId: { in: [creatorId, requesterId] },
          status: PairingRequestStatus.PENDING,
          id: { not: request.id },
        },
        data: {
          status: PairingRequestStatus.REJECTED,
          respondedAt: new Date(),
        },
      });

      return couple;
    });

    // Notify both via socket
    this.events.notifyPairingSuccess(
      result.members[0].userId,
      result.members[1].userId,
      { coupleId: result.id },
    );

    return {
      coupleId: result.id,
      pairedAt: result.pairedAt,
      partner: result.members
        .find((m) => m.userId !== userId)
        ?.user,
    };
  }

  // ── Get Couple Info ────────────────────────────────────────────────────────

  async getCoupleInfo(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: {
        couple: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    profile: {
                      select: {
                        displayName: true,
                        avatarUrl: true,
                        bio: true,
                      },
                    },
                    locationSharing: {
                      select: {
                        isSharing: true,
                        status: true,
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
      throw new NotFoundException('You are not in an active couple');
    }

    const partner = member.couple.members.find((m) => m.userId !== userId);

    return {
      coupleId: member.coupleId,
      pairedAt: member.couple.pairedAt,
      partner: partner?.user,
    };
  }

  // ── Update Anniversary Date ───────────────────────────────────────────────

  async updateAnniversary(userId: string, pairedAtStr: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: {
        couple: {
          include: {
            members: {
              where: { userId: { not: userId } },
            },
          },
        },
      },
    });

    if (!member || member.couple.status !== CoupleStatus.ACTIVE) {
      throw new NotFoundException('Bạn hiện không ở trong một mối quan hệ cặp đôi nào');
    }

    const pairedAt = new Date(pairedAtStr);
    if (isNaN(pairedAt.getTime())) {
      throw new BadRequestException('Ngày kỷ niệm không hợp lệ');
    }

    const updated = await this.prisma.couple.update({
      where: { id: member.coupleId },
      data: { pairedAt },
    });

    const partnerId = member.couple.members?.[0]?.userId;
    if (partnerId) {
      this.events.notifyAnniversaryUpdated(partnerId, {
        coupleId: updated.id,
        pairedAt: updated.pairedAt.toISOString(),
      });
    }

    return {
      coupleId: updated.id,
      pairedAt: updated.pairedAt,
    };
  }

  // ── Dissolve Couple ────────────────────────────────────────────────────────

  async dissolveCouple(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
      include: {
        couple: {
          include: { members: true },
        },
      },
    });

    if (!member || member.couple.status !== CoupleStatus.ACTIVE) {
      throw new NotFoundException('Bạn hiện không ở trong một mối quan hệ cặp đôi nào');
    }

    const partnerId = member.couple.members.find(
      (m) => m.userId !== userId,
    )?.userId;

    await this.prisma.$transaction(async (tx) => {
      // 1. Đánh dấu cặp đôi là DISSOLVED và lưu người thực hiện hủy
      await tx.couple.update({
        where: { id: member.coupleId },
        data: {
          status: CoupleStatus.DISSOLVED,
          dissolvedAt: new Date(),
          dissolvedBy: userId,
        },
      });

      // 2. NGHIỆP VỤ: "Nếu cuộc ghép đôi bị hủy thì mã đó cũng sẽ mất"
      // Xóa vĩnh viễn toàn bộ mã ghép đôi của cả 2 người (bao gồm mã đã kết nối)
      // Các yêu cầu pairingRequest liên quan sẽ tự động bị xóa (Cascade)
      await tx.pairingCode.deleteMany({
        where: {
          creatorId: { in: [userId, ...(partnerId ? [partnerId] : [])] },
        },
      });

      // 3. NGHIỆP VỤ: "2 người được tạo mã mới"
      // Xóa liên kết couple_members để giải phóng cả 2 userId khỏi ràng buộc @unique
      // Giúp 2 người hoàn toàn trở về trạng thái tự do để tạo mã mới hoặc ghép đôi mới
      await tx.coupleMember.deleteMany({
        where: { coupleId: member.coupleId },
      });

      // 4. Dừng chia sẻ vị trí của cả 2 người
      await tx.locationSharingSetting.updateMany({
        where: { userId: { in: [userId, ...(partnerId ? [partnerId] : [])] } },
        data: { isSharing: false, status: 'STOPPED' },
      });
    });

    // Notify both via socket
    if (partnerId) {
      this.events.notifyCoupleDisconnected(partnerId);
    }
    this.events.notifyCoupleDisconnected(userId);

    this.logger.log(`Couple ${member.coupleId} dissolved by user ${userId}`);
    return { message: 'Mối quan hệ cặp đôi đã được hủy thành công' };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async generateUniqueCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
    for (let i = 0; i < 10; i++) {
      const code = Array.from({ length: 8 }, () =>
        chars[Math.floor(Math.random() * chars.length)],
      ).join('');

      const existing = await this.prisma.pairingCode.findFirst({
        where: { code, status: PairingCodeStatus.ACTIVE },
      });

      if (!existing) return code;
    }
    throw new Error('Could not generate unique code');
  }
}
