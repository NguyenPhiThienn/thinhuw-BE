import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OtpPurpose, OtpStatus } from '@prisma/client';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async createAndSendOtp(
    userId: string,
    email: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    // Cancel any existing pending OTPs for this user/purpose
    await this.prisma.otp.updateMany({
      where: { userId, purpose, status: OtpStatus.PENDING },
      data: { status: OtpStatus.CANCELLED },
    });

    // Generate OTP
    const otpMode = this.configService.get<string>('OTP_MODE', 'development');
    const code =
      otpMode === 'development'
        ? this.configService.get<string>('OTP_DEV_CODE', '123456')
        : this.generateRandomOtp();

    // Hash OTP
    const codeHash = await bcrypt.hash(code, 10);

    const expiresInMins = parseInt(
      this.configService.get<string>('OTP_EXPIRES_IN_MINUTES', '10'),
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMins);

    await this.prisma.otp.create({
      data: {
        userId,
        email: email.toLowerCase(),
        codeHash,
        purpose,
        expiresAt,
        maxAttempts: parseInt(
          this.configService.get<string>('OTP_MAX_ATTEMPTS', '5'),
        ),
      },
    });

    // Send email
    if (otpMode === 'development') {
      this.logger.log(
        `[DEV MODE] OTP for ${email} (${purpose}): ${code}`,
      );
    } else {
      await this.mailService.sendOtpEmail(email, code, purpose);
    }
  }

  async verifyOtp(
    userId: string,
    email: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const otp = await this.prisma.otp.findFirst({
      where: {
        userId,
        email: email.toLowerCase(),
        purpose,
        status: OtpStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('No pending OTP found. Please request a new OTP.');
    }

    // Check expiry
    if (otp.expiresAt < new Date()) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { status: OtpStatus.EXPIRED },
      });
      throw new UnauthorizedException('OTP has expired. Please request a new one.');
    }

    // Check max attempts
    if (otp.attempts >= otp.maxAttempts) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { status: OtpStatus.EXPIRED },
      });
      throw new UnauthorizedException('Too many failed attempts. Please request a new OTP.');
    }

    // Verify code
    const isValid = await bcrypt.compare(code, otp.codeHash);

    if (!isValid) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = otp.maxAttempts - otp.attempts - 1;
      throw new UnauthorizedException(
        `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }

    // Mark as verified
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { status: OtpStatus.VERIFIED, verifiedAt: new Date() },
    });
  }

  private generateRandomOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
