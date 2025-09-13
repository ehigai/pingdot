import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { verifyToken } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader) throw new UnauthorizedException('Missing auth header');

    const token = authHeader.replace('Bearer ', '');

    try {
      const decoded = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        issuer: '', // TODO: Add issuer string
      });

      req['user'] = decoded;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
