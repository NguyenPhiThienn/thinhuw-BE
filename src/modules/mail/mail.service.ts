import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { OtpPurpose } from '@prisma/client';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST', 'localhost'),
      port: parseInt(this.configService.get<string>('MAIL_PORT', '1025')),
      secure: this.configService.get<string>('MAIL_SECURE', 'false') === 'true',
      auth:
        this.configService.get<string>('MAIL_USER') &&
        this.configService.get<string>('MAIL_PASS')
          ? {
              user: this.configService.get<string>('MAIL_USER'),
              pass: this.configService.get<string>('MAIL_PASS'),
            }
          : undefined,
    });
  }

  async sendOtpEmail(
    email: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const subject = this.getOtpSubject(purpose);
    const html = this.getOtpEmailHtml(code, purpose);

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>(
          'MAIL_FROM',
          'Thinhuw <noreply@thinhuw.app>',
        ),
        to: email,
        subject,
        html,
      });
      this.logger.log(`OTP email sent to ${email} (${purpose})`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}: ${error.message}`);
      throw error;
    }
  }

  private getOtpSubject(purpose: OtpPurpose): string {
    const subjects = {
      [OtpPurpose.REGISTER]: '💕 Chào mừng đến với Thinhuw - Xác minh email',
      [OtpPurpose.LOGIN]: '🔐 Thinhuw - Mã đăng nhập',
      [OtpPurpose.RESET_PASSWORD]: '🔑 Thinhuw - Đặt lại mật khẩu',
      [OtpPurpose.CHANGE_EMAIL]: '✉️ Thinhuw - Xác minh email mới',
    };
    return subjects[purpose] || 'Thinhuw - Mã xác minh';
  }

  private getOtpEmailHtml(code: string, purpose: OtpPurpose): string {
    const messages = {
      [OtpPurpose.REGISTER]: 'Cảm ơn bạn đã đăng ký Thinhuw! Nhập mã bên dưới để xác minh email.',
      [OtpPurpose.LOGIN]: 'Ai đó đang đăng nhập vào tài khoản Thinhuw của bạn.',
      [OtpPurpose.RESET_PASSWORD]: 'Bạn đã yêu cầu đặt lại mật khẩu Thinhuw.',
      [OtpPurpose.CHANGE_EMAIL]: 'Xác minh địa chỉ email mới của bạn.',
    };

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0D0F1A; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: #141628; border-radius: 20px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #A78BFA, #F472B6); padding: 40px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 800; }
    .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; }
    .body { padding: 40px; }
    .body p { color: #9CA3AF; line-height: 1.6; }
    .otp-box { background: #1C2040; border: 2px solid #A78BFA; border-radius: 16px; padding: 30px; text-align: center; margin: 30px 0; }
    .otp-code { font-size: 48px; font-weight: 800; letter-spacing: 8px; color: #A78BFA; font-family: monospace; }
    .otp-note { color: #9CA3AF; font-size: 14px; margin-top: 12px; }
    .warning { background: #1C1A30; border-left: 4px solid #F472B6; padding: 16px; border-radius: 8px; color: #9CA3AF; font-size: 14px; }
    .footer { padding: 20px 40px; text-align: center; color: #4B5563; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💕 Thinhuw</h1>
      <p>Ứng dụng chia sẻ vị trí dành cho hai người</p>
    </div>
    <div class="body">
      <p>${messages[purpose] || 'Nhập mã bên dưới để tiếp tục.'}</p>
      <div class="otp-box">
        <div class="otp-code">${code}</div>
        <div class="otp-note">Mã có hiệu lực trong 10 phút</div>
      </div>
      <div class="warning">
        ⚠️ Không chia sẻ mã này với bất kỳ ai. Thinhuw sẽ không bao giờ hỏi mã của bạn.
      </div>
    </div>
    <div class="footer">
      © 2026 Thinhuw. Tất cả quyền được bảo lưu.<br>
      Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.
    </div>
  </div>
</body>
</html>
    `;
  }
}
