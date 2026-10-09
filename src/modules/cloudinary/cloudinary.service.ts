import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  public isAvailable = false;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isAvailable = true;
      this.logger.log(`Cloudinary configured successfully for cloud: ${cloudName}`);
    } else {
      this.logger.warn('Cloudinary credentials missing, fallback to local storage will be used');
    }
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'thinhuw/avatars',
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Cloudinary credentials are not configured');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            this.logger.error('Upload to Cloudinary failed:', error);
            return reject(error || new Error('Upload failed'));
          }
          resolve(result.secure_url);
        },
      );

      const stream = Readable.from(file.buffer);
      stream.pipe(uploadStream);
    });
  }
}
