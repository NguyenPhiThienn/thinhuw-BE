import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
