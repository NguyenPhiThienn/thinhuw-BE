import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** Tạo ID người dùng gồm 12 chữ số ngẫu nhiên */
function generateUserId(): string {
  // Tạo số ngẫu nhiên 12 chữ số (100000000000 - 999999999999)
  const min = 100_000_000_000;
  const max = 999_999_999_999;
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
}

import { OtpService } from '../otp/otp.service';
import { UsersService } from '../users/users.service';
import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from './dto';
import { OtpPurpose } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
  ) {}

  // ── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      if (!existing.isEmailVerified) {
        // Allow re-register to update password/name and resend OTP
        const passwordHash = dto.password
          ? await bcrypt.hash(dto.password, 12)
          : existing.passwordHash;
        const resolvedName = dto.name?.trim() || dto.displayName?.trim();
        const birthDate = dto.birthDate ? new Date(dto.birthDate) : undefined;
        let computedAge = dto.age;
        if (computedAge === undefined && birthDate) {
          const today = new Date();
          let a = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) a--;
          computedAge = a;
        }
        const gender = (dto.gender as any) ?? undefined;

        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            ...(resolvedName ? { name: resolvedName, displayName: resolvedName } : {}),
            ...(computedAge !== undefined ? { age: computedAge } : {}),
            ...(birthDate ? { birthDate } : {}),
            ...(gender ? { gender } : {}),
            ...(resolvedName
              ? {
                  profile: {
                    upsert: {
                      create: { displayName: resolvedName, birthDate, gender },
                      update: { displayName: resolvedName, ...(birthDate && { birthDate }), ...(gender && { gender }) },
                    },
                  },
                }
              : {}),
          },
        });

        await this.sendOtp({ email: dto.email }, OtpPurpose.REGISTER);
        return {
          userId: existing.id,
          message: 'OTP resent. Please verify your email.',
        };
      }
      throw new ConflictException('Email already registered');
    }

    // Create unverified user with optional profile
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : null;

    const resolvedName = dto.name?.trim() || dto.displayName?.trim() || dto.email.split('@')[0];
    const birthDate = dto.birthDate ? new Date(dto.birthDate) : undefined;
    let computedAge = dto.age;
    if (computedAge === undefined && birthDate) {
      const today = new Date();
      let a = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) a--;
      computedAge = a;
    }
    const gender = (dto.gender as any) ?? undefined;

    const user = await this.prisma.user.create({
      data: {
        id: generateUserId(),
        email: dto.email.toLowerCase(),
        passwordHash,
        name: resolvedName,
        displayName: resolvedName,
        ...(computedAge !== undefined && { age: computedAge }),
        ...(birthDate && { birthDate }),
        ...(gender && { gender }),
        isEmailVerified: false,
        profile: {
          create: {
            displayName: resolvedName,
            ...(birthDate && { birthDate }),
            ...(gender && { gender }),
          },
        },
      },
    });


    // Send OTP via email
    await this.sendOtp({ email: dto.email }, OtpPurpose.REGISTER);

    await this.auditLog(user.id, 'REGISTER', null);

    return {
      userId: user.id,
      message: 'Registration initiated. Check your email for OTP.',
    };
  }

  // ── Send OTP ───────────────────────────────────────────────────────────────

  async sendOtp(dto: SendOtpDto, purpose: OtpPurpose = OtpPurpose.LOGIN) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    // For security, don't reveal if user exists for LOGIN/RESET
    // But for REGISTER, we need the user to exist (created above)
    if (!user && purpose === OtpPurpose.REGISTER) {
      throw new NotFoundException('User not found');
    }
    if (!user) {
      return { message: 'If this email exists, OTP has been sent.' };
    }

    await this.otpService.createAndSendOtp(user.id, user.email, purpose);
    return { message: 'OTP sent successfully.' };
  }

  // ── Verify OTP ─────────────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const purpose =
      dto.purpose === 'RESET_PASSWORD'
        ? OtpPurpose.RESET_PASSWORD
        : dto.purpose === 'LOGIN'
          ? OtpPurpose.LOGIN
          : OtpPurpose.REGISTER;

    await this.otpService.verifyOtp(user.id, dto.email, dto.code, purpose);

    // If registering, mark email as verified and auto-login (return tokens + user)
    if (purpose === OtpPurpose.REGISTER) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
      const tokens = await this.generateTokens(user.id, user.email);
      await this.auditLog(user.id, 'REGISTER_COMPLETE', null);
      const userData = await this.usersService.findById(user.id);
      return {
        verified: true,
        tokens,
        user: userData,
        requiresProfile: !(await this.hasProfile(user.id)),
      };
    }

    // For login OTP, return tokens + user
    if (purpose === OtpPurpose.LOGIN) {
      const tokens = await this.generateTokens(user.id, user.email);
      await this.auditLog(user.id, 'LOGIN', null);
      const userData = await this.usersService.findById(user.id);
      return { verified: true, tokens, user: userData };
    }

    // For reset password, return reset token
    const resetToken = await this.generatePasswordResetToken(user.id);
    return { verified: true, resetToken };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        isActive: true,
        deletedAt: null,
      },
    });

    if (!user || !user.isEmailVerified) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // If user has no password (OTP-only), require OTP
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses OTP login. Please use Send OTP.',
      );
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    await this.auditLog(user.id, 'LOGIN', ipAddress);
    const userData = await this.usersService.findById(user.id);
    return { tokens, user: userData };
  }

  // ── Refresh Token ──────────────────────────────────────────────────────────

  async refreshToken(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new UnauthorizedException('User is inactive');
    }

    // Rotate: revoke old token, issue new pair
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(stored.userId, stored.user.email);
    await this.auditLog(stored.userId, 'TOKEN_REFRESH', null);
    return tokens;
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken
        .update({
          where: { tokenHash },
          data: { revokedAt: new Date() },
        })
        .catch(() => {}); // Ignore if not found
    } else {
      // Revoke all refresh tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.auditLog(userId, 'LOGOUT', null);
    return { message: 'Logged out successfully' };
  }

  // ── Forgot Password ────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), isEmailVerified: true },
    });

    // Always return success to avoid email enumeration
    if (user) {
      await this.otpService.createAndSendOtp(
        user.id,
        user.email,
        OtpPurpose.RESET_PASSWORD,
      );
    }

    return {
      message:
        'If this email is registered, you will receive a password reset OTP.',
    };
  }

  // ── Reset Password ─────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset request');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Revoke all refresh tokens for security
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditLog(user.id, 'CHANGE_PASSWORD', null);
    return { message: 'Password reset successfully' };
  }

  // ── Get Current User ───────────────────────────────────────────────────────

  async getMe(userId: string) {
    return this.usersService.findById(userId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
          '15m',
        ),
      }),
      this.generateRefreshToken(userId),
    ]);

    return { accessToken, refreshToken };
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);

    const expiresInDays = parseInt(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (isNaN(expiresInDays) ? 7 : expiresInDays));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async hasProfile(userId: string): Promise<boolean> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    return !!profile;
  }

  private async generatePasswordResetToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, purpose: 'reset' },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '30m',
      },
    );
  }

  private async auditLog(
    userId: string,
    action: string,
    ipAddress?: string | null,
  ) {
    try {
      await this.prisma.auditEvent.create({
        data: { userId, action: action as any, ipAddress },
      });
    } catch {
      // Don't fail if audit log fails
    }
  }
}
