import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinCoupleDto {
  @ApiProperty({
    example: 'ABCD2345',
    description: '8-character alphanumeric pairing code',
  })
  @IsString()
  @Length(8, 8)
  @Matches(/^[A-Za-z0-9]{8}$/, { message: 'Pairing code must be 8 alphanumeric characters' })
  code: string;
}

export class AcceptPairingDto {
  @ApiProperty({
    example: 'clxx1234567890abcdef',
    description: 'Pairing request ID',
  })
  @IsString()
  requestId: string;
}
