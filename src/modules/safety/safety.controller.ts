import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SafetyService } from './safety.service';
import { TriggerSosDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Safety')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('safety')
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('sos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger SOS emergency alert to partner' })
  @ApiResponse({ status: 201, description: 'SOS Alert triggered' })
  async triggerSos(
    @CurrentUser('id') userId: string,
    @Body() dto: TriggerSosDto,
  ) {
    return this.safetyService.triggerSos(userId, dto);
  }

  @Post('sos/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recipient acknowledges SOS alert' })
  @ApiResponse({ status: 200, description: 'SOS Alert acknowledged' })
  async acknowledgeSos(
    @CurrentUser('id') userId: string,
    @Param('id') alertId: string,
  ) {
    return this.safetyService.acknowledgeSos(userId, alertId);
  }

  @Post('sos/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark SOS alert as resolved' })
  @ApiResponse({ status: 200, description: 'SOS Alert resolved' })
  async resolveSos(
    @CurrentUser('id') userId: string,
    @Param('id') alertId: string,
  ) {
    return this.safetyService.resolveSos(userId, alertId);
  }

  @Post('sos/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Creator cancels SOS alert' })
  @ApiResponse({ status: 200, description: 'SOS Alert cancelled' })
  async cancelSos(
    @CurrentUser('id') userId: string,
    @Param('id') alertId: string,
  ) {
    return this.safetyService.cancelSos(userId, alertId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get current active SOS alert for couple' })
  @ApiResponse({ status: 200, description: 'Active SOS alert or null' })
  async getActiveAlert(@CurrentUser('id') userId: string) {
    return this.safetyService.getActiveAlert(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get SOS alert history for couple' })
  @ApiResponse({ status: 200, description: 'List of past alerts' })
  async getAlertHistory(@CurrentUser('id') userId: string) {
    return this.safetyService.getAlertHistory(userId);
  }
}
