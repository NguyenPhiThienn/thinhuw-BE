import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { PlacesService } from './places.service';
import { CreatePlaceDto, UpdatePlaceDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Places')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a favorite place (optionally shared with partner)' })
  @ApiResponse({ status: 201, description: 'Place created' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePlaceDto,
  ) {
    return this.placesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all favorite places (personal + couple shared)' })
  @ApiResponse({ status: 200, description: 'List of places' })
  async findAll(@CurrentUser('id') userId: string) {
    return this.placesService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific place by ID' })
  @ApiResponse({ status: 200, description: 'Place details' })
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.placesService.findOne(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update place details or sharing status' })
  @ApiResponse({ status: 200, description: 'Updated place' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.placesService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a favorite place' })
  @ApiResponse({ status: 200, description: 'Place deleted' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.placesService.delete(userId, id);
  }
}
