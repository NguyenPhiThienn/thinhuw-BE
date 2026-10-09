import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FavoritePlaceType } from '@prisma/client';

export class CreatePlaceDto {
  @ApiProperty({ example: 'Nhà của chúng mình' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ enum: FavoritePlaceType, default: FavoritePlaceType.CUSTOM })
  @IsOptional()
  @IsEnum(FavoritePlaceType)
  type?: FavoritePlaceType;

  @ApiPropertyOptional({ example: '🏠' })
  @IsOptional()
  @IsString()
  icon?: string;

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

  @ApiPropertyOptional({ example: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 100, description: 'Geofence radius in meters' })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(2000)
  radius?: number;

  @ApiPropertyOptional({ example: true, description: 'Share this place with your partner' })
  @IsOptional()
  @IsBoolean()
  sharedWithPartner?: boolean;
}

export class UpdatePlaceDto {
  @ApiPropertyOptional({ example: 'Nhà của chúng mình' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: FavoritePlaceType })
  @IsOptional()
  @IsEnum(FavoritePlaceType)
  type?: FavoritePlaceType;

  @ApiPropertyOptional({ example: '🏠' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: 10.7769 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 106.7009 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(2000)
  radius?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  sharedWithPartner?: boolean;
}
