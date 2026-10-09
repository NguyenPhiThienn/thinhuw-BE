import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Query,
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
import { LocationService } from './location.service';
import {
  UpdateLocationDto,
  UpdateLocationSettingDto,
  LocationHistoryQueryDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Location')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post('update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current location (broadcasts to partner if sharing)' })
  @ApiResponse({ status: 200, description: 'Location saved and broadcasted' })
  async updateLocation(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationService.updateLocation(userId, dto);
  }

  @Get('partner')
  @ApiOperation({ summary: 'Get current location of partner' })
  @ApiResponse({ status: 200, description: 'Partner location data' })
  @ApiResponse({ status: 404, description: 'No active partner found' })
  async getPartnerLocation(@CurrentUser('id') userId: string) {
    return this.locationService.getPartnerLocation(userId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get location sharing privacy settings' })
  @ApiResponse({ status: 200, description: 'Sharing settings' })
  async getSharingStatus(@CurrentUser('id') userId: string) {
    return this.locationService.getSharingSetting(userId);
  }

  @Put('status')
  @ApiOperation({ summary: 'Update location sharing privacy settings' })
  @ApiResponse({ status: 200, description: 'Updated sharing settings' })
  async updateSharingStatus(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLocationSettingDto,
  ) {
    return this.locationService.updateSharingSetting(userId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get location history for self or partner' })
  @ApiResponse({ status: 200, description: 'List of historical coordinates' })
  async getHistory(
    @CurrentUser('id') userId: string,
    @Query() query: LocationHistoryQueryDto,
  ) {
    return this.locationService.getHistory(userId, query);
  }

  @Delete('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete own location history' })
  @ApiResponse({ status: 200, description: 'History deleted' })
  async deleteHistory(@CurrentUser('id') userId: string) {
    return this.locationService.deleteHistory(userId);
  }
}
