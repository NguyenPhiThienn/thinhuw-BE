import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        age: true,
        birthDate: true,
        gender: true,
        isEmailVerified: true,
        createdAt: true,
        profile: {
          select: {
            displayName: true,
            avatarUrl: true,
            birthDate: true,
            gender: true,
            bio: true,
          },
        },
        coupleMember: {
          select: {
            coupleId: true,
            joinedAt: true,
            couple: {
              select: {
                status: true,
                pairedAt: true,
                members: {
                  where: { userId: { not: userId } },
                  select: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        displayName: true,
                        age: true,
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
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const birthDate = dto.birthDate ? new Date(dto.birthDate) : undefined;
    let computedAge = dto.age;
    if (computedAge === undefined && birthDate) {
      const today = new Date();
      let a = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) a--;
      computedAge = a;
    }

    const resolvedName = dto.name ?? dto.displayName;

    // Cập nhật trực tiếp bảng User (name, displayName, age, birthDate, gender)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(resolvedName !== undefined && { name: resolvedName, displayName: resolvedName }),
        ...(computedAge !== undefined && { age: computedAge }),
        ...(birthDate !== undefined && { birthDate }),
        ...(dto.gender !== undefined && { gender: dto.gender as any }),
      },
    });

    // Đồng bộ sang UserProfile (avatar, bio, và các field trùng lặp)
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: resolvedName ?? '',
        avatarUrl: dto.avatarUrl,
        birthDate,
        gender: dto.gender as any,
        bio: dto.bio,
      },
      update: {
        ...(resolvedName !== undefined && { displayName: resolvedName }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(birthDate !== undefined && { birthDate }),
        ...(dto.gender !== undefined && { gender: dto.gender as any }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
      },
    });

    return this.findById(userId);
  }

  async deleteAccount(userId: string) {
    // Soft delete
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        email: `deleted_${Date.now()}_${userId}@deleted.thinhuw`,
      },
    });

    // Revoke all tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Account deleted successfully' };
  }
}
