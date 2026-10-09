import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { LocationScheduler } from './location.scheduler';

@Module({
  controllers: [LocationController],
  providers: [LocationService, LocationScheduler],
  exports: [LocationService],
})
export class LocationModule {}
