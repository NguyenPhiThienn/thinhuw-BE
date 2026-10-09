import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { CouplesService } from './couples.service';
import { JoinCoupleDto, AcceptPairingDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Couples')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('couples')
export class CouplesController {
  constructor(private readonly couplesService: CouplesService) {}

  @Post('pairing-code')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new 8-character pairing code' })
  @ApiResponse({ status: 201, description: 'Code generated' })
  @ApiResponse({ status: 409, description: 'User already in a couple' })
  async createPairingCode(@CurrentUser('id') userId: string) {
    return this.couplesService.createPairingCode(userId);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit pairing code to request couple connection' })
  @ApiResponse({ status: 200, description: 'Pairing request created' })
  @ApiResponse({ status: 400, description: 'Code expired or self-pairing' })
  @ApiResponse({ status: 404, description: 'Code not found' })
  async joinWithCode(
    @CurrentUser('id') userId: string,
    @Body() dto: JoinCoupleDto,
  ) {
    return this.couplesService.joinWithCode(userId, dto.code);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept pairing request and establish couple' })
  @ApiResponse({ status: 200, description: 'Couple created successfully' })
  @ApiResponse({ status: 403, description: 'Unauthorized to accept' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async acceptPairing(
    @CurrentUser('id') userId: string,
    @Body() dto: AcceptPairingDto,
  ) {
    return this.couplesService.acceptPairing(userId, dto.requestId);
  }

  @Get()
  @ApiOperation({ summary: 'Get current couple information and partner details' })
  @ApiResponse({ status: 200, description: 'Couple details' })
  @ApiResponse({ status: 404, description: 'Not in a couple' })
  async getCoupleInfo(@CurrentUser('id') userId: string) {
    return this.couplesService.getCoupleInfo(userId);
  }

  @Put('anniversary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update couple anniversary date' })
  @ApiResponse({ status: 200, description: 'Anniversary date updated' })
  @ApiResponse({ status: 404, description: 'Not in a couple' })
  async updateAnniversary(
    @CurrentUser('id') userId: string,
    @Body() dto: { pairedAt: string },
  ) {
    return this.couplesService.updateAnniversary(userId, dto.pairedAt);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dissolve current couple relationship' })
  @ApiResponse({ status: 200, description: 'Relationship dissolved' })
  @ApiResponse({ status: 404, description: 'Not in a couple' })
  async dissolveCouple(@CurrentUser('id') userId: string) {
    return this.couplesService.dissolveCouple(userId);
  }
}
