import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  IsDateString,
  IsEnum,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Kiểm tra tuổi >= 16 */
@ValidatorConstraint({ name: 'minAge', async: false })
class MinAgeConstraint implements ValidatorConstraintInterface {
  validate(dateStr: string) {
    if (!dateStr) return true;
    const birthDate = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 16;
  }
  defaultMessage(_args: ValidationArguments) {
    return 'Tuổi phải từ 16 trở lên';
  }
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiPropertyOptional({ example: 'securepassword123', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password?: string;

  @ApiPropertyOptional({ example: 'Thiên Thịnh' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'Thiên Thịnh', description: 'Tên người dùng' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 20, minimum: 16, description: 'Tuổi (>= 16)' })
  @IsOptional()
  @Validate((val: any) => typeof val === 'number' && val >= 16, {
    message: 'Tuổi phải từ 16 trở lên',
  })
  age?: number;

  @ApiPropertyOptional({ example: '2000-02-14', description: 'Ngày sinh (tuổi >= 16)' })
  @IsOptional()
  @IsDateString()
  @Validate(MinAgeConstraint)
  birthDate?: string;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] })
  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string;
}


export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securepassword123' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class SendOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'LOGIN',
    enum: ['REGISTER', 'LOGIN', 'RESET_PASSWORD'],
  })
  @IsOptional()
  @IsIn(['REGISTER', 'LOGIN', 'RESET_PASSWORD'])
  purpose?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  code: string;

  @ApiPropertyOptional({
    example: 'REGISTER',
    enum: ['REGISTER', 'LOGIN', 'RESET_PASSWORD'],
  })
  @IsOptional()
  @IsIn(['REGISTER', 'LOGIN', 'RESET_PASSWORD'])
  purpose?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'newpassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
