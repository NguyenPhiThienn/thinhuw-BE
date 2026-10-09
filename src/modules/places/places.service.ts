import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlaceDto, UpdatePlaceDto } from './dto';

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreatePlaceDto) {
    let coupleId: string | undefined = undefined;

    if (dto.sharedWithPartner) {
      const member = await this.prisma.coupleMember.findUnique({
        where: { userId },
      });
      if (member) {
        coupleId = member.coupleId;
      }
    }

    return this.prisma.favoritePlace.create({
      data: {
        userId,
        coupleId,
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        radius: dto.radius ?? 100,
      },
    });
  }

  async findAll(userId: string) {
    const member = await this.prisma.coupleMember.findUnique({
      where: { userId },
    });

    const whereConditions: any[] = [{ userId }];
    if (member?.coupleId) {
      whereConditions.push({ coupleId: member.coupleId });
    }

    return this.prisma.favoritePlace.findMany({
      where: {
        OR: whereConditions,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const place = await this.prisma.favoritePlace.findUnique({
      where: { id },
    });

    if (!place) {
      throw new NotFoundException('Place not found');
    }

    // Check permission
    if (place.userId !== userId) {
      if (place.coupleId) {
        const member = await this.prisma.coupleMember.findUnique({
          where: { userId },
        });
        if (member?.coupleId !== place.coupleId) {
          throw new ForbiddenException('Access denied');
        }
      } else {
        throw new ForbiddenException('Access denied');
      }
    }

    return place;
  }

  async update(userId: string, id: string, dto: UpdatePlaceDto) {
    const place = await this.findOne(userId, id);

    let coupleId = place.coupleId;
    if (dto.sharedWithPartner !== undefined) {
      if (dto.sharedWithPartner) {
        const member = await this.prisma.coupleMember.findUnique({
          where: { userId },
        });
        coupleId = member?.coupleId ?? null;
      } else {
        coupleId = null;
      }
    }

    return this.prisma.favoritePlace.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        radius: dto.radius,
        coupleId,
      },
    });
  }

  async delete(userId: string, id: string) {
    await this.findOne(userId, id);

    await this.prisma.favoritePlace.delete({
      where: { id },
    });

    return { message: 'Place deleted successfully' };
  }
}
