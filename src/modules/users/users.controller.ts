import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EventsGateway } from '../../gateways/events.gateway';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly events: EventsGateway,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile details' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Updated profile details' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload avatar image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Avatar uploaded and profile updated' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Chỉ cho phép tệp ảnh (JPEG, PNG, WEBP, GIF)'), false);
        }
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Không tìm thấy file ảnh trong request');

    let avatarUrl: string;

    if (this.cloudinaryService.isAvailable) {
      try {
        avatarUrl = await this.cloudinaryService.uploadImage(file, 'thinhuw/avatars');
      } catch (err: any) {
        throw new BadRequestException('Không thể tải ảnh lên Cloudinary: ' + (err?.message || 'Lỗi'));
      }
    } else {
      // Fallback lưu local nếu chưa cấu hình Cloudinary
      const uploadDir = join(process.cwd(), 'uploads', 'avatars');
      await fs.mkdir(uploadDir, { recursive: true });
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const filename = `avatar-${uniqueSuffix}${extname(file.originalname || '.jpg')}`;
      await fs.writeFile(join(uploadDir, filename), file.buffer);

      const protocol = req.protocol;
      const host = req.get('host');
      avatarUrl = `${protocol}://${host}/uploads/avatars/${filename}`;
    }

    const updated = await this.usersService.updateProfile(userId, { avatarUrl });

    // Thông báo cho người yêu qua socket để cập nhật marker và profile thời gian thực
    const partnerId = updated?.coupleMember?.couple?.members?.[0]?.user?.id;
    if (partnerId) {
      this.events.notifyAvatarUpdated(partnerId, { userId, avatarUrl });
    }

    return { avatarUrl, user: updated };
  }

  @Delete('account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete account and revoke all sessions' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  async deleteAccount(@CurrentUser('id') userId: string) {
    return this.usersService.deleteAccount(userId);
  }
}
