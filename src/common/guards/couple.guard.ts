import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Guard to ensure user has an active couple.
 * Must be used after JwtAuthGuard.
 */
@Injectable()
export class CoupleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user: any = request['user'];

    if (!user?.coupleMember || user.coupleMember.couple?.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'You must be in an active couple to access this resource',
      );
    }

    return true;
  }
}
