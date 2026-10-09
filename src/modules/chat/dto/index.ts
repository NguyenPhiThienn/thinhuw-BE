import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MessageType } from '@prisma/client';

export class SendMessageDto {
  @ApiProperty({ example: 'Anh đang đến đón em nè ❤️' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ enum: MessageType, default: MessageType.TEXT })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}

export class QueryMessagesDto {
  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'clxx1234567890abcdef', description: 'Cursor message ID' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'List of message IDs to mark as read' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messageIds?: string[];
}
