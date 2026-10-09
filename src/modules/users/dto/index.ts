import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Kiểm tra tuổi >= 16 */
@ValidatorConstraint({ name: 'minAge', async: false })
class MinAgeConstraint implements ValidatorConstraintInterface {
  validate(dateStr: string, _args: ValidationArguments) {
    if (!dateStr) return true; // optional field
    const birthDate = new Date(dateStr);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    const actualAge =
      monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    return actualAge >= 16;
  }

  defaultMessage(_args: ValidationArguments) {
    return 'Tuổi phải từ 16 trở lên';
  }
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Quỳnh Như' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Quỳnh Như', description: 'Tên người dùng' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: 20, minimum: 16, description: 'Tuổi (>= 16)' })
  @IsOptional()
  @Validate((val: any) => typeof val === 'number' && val >= 16, {
    message: 'Tuổi phải từ 16 trở lên',
  })
  age?: number;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '2000-01-15', description: 'Ngày sinh (tuổi >= 16)' })
  @IsOptional()
  @IsDateString()
  @Validate(MinAgeConstraint)
  birthDate?: string;

  @ApiPropertyOptional({
    enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
    description: 'Giới tính',
  })
  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string;

  @ApiPropertyOptional({ example: 'Yêu anh ấy mãi mãi 💕' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;
}
