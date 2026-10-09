import {
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsString,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MovementStatus, LocationSharingStatus } from '@prisma/client';

export class UpdateLocationDto {
  @ApiProperty({ example: 10.7769 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 106.7009 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional({ example: 5.2 })
  @IsOptional()
  @IsNumber()
  altitude?: number;

  @ApiPropertyOptional({ example: 1.4 })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional({ example: 85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  battery?: number;

  @ApiPropertyOptional({ enum: MovementStatus, example: MovementStatus.STATIONARY })
  @IsOptional()
  @IsEnum(MovementStatus)
  movementStatus?: MovementStatus;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isCharging?: boolean;

  @ApiPropertyOptional({ example: 'Quận 1, Thành phố Hồ Chí Minh' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '2026-10-08T09:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class UpdateLocationSettingDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isSharing?: boolean;

  @ApiPropertyOptional({ enum: LocationSharingStatus })
  @IsOptional()
  @IsEnum(LocationSharingStatus)
  status?: LocationSharingStatus;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  shareMovement?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  shareBattery?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  shareSpeed?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  stopDetection?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(120)
  stopMinutes?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  batteryAlerts?: boolean;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(50)
  batteryThreshold?: number;
}

export class LocationHistoryQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-03T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  partner?: boolean;
}
