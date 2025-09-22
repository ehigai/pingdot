import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { authErrorConstants, jwtConstants } from './constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.public';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip guard if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const type = context.getType() as 'http' | 'ws';
    const container =
      type === 'http'
        ? context.switchToHttp().getRequest<Request>()
        : context.switchToWs().getClient();

    const token = this.extractToken(type, container);
    return this.validate(token, container, type);
  }
  private extractToken(type: 'http' | 'ws', container: any): string | undefined {
    if (type === 'http') {
      const req = container as Request;
      const header = req.headers.authorization;
      if (!header) return undefined;
      const [t, token] = header.split(' ');
      return t === 'Bearer' ? token : undefined;
    }

    // ws
    const client = container as any;
    const headerAuth = client.handshake?.headers?.authorization;
    if (headerAuth) {
      const [t, token] = headerAuth.split(' ');
      if (t === 'Bearer') return token;
    }
    const authToken = client.handshake?.auth?.token;
    if (authToken) {
      const [t, token] = authToken.split(' ');
      if (t === 'Bearer') return token;
    }
    return client.handshake?.query?.token as string | undefined;
  }

  private async validate(
    token: string | undefined,
    container: any,
    type: 'http' | 'ws',
  ): Promise<boolean> {
    if (!token) {
      this.logger.warn(`No token provided for ${type}`);
      if (type === 'http')
        throw new UnauthorizedException({
          status: 401,
          errorCode: authErrorConstants.invalidAccessToken,
          message: 'Unauthorized',
        });
      throw new WsException('Unauthorized');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      // Attach to container for downstream usage
      container.user = payload;
      return true;
    } catch (err) {
      this.logger.warn('Token verification failed', err as any);
      if (type === 'http') throw new UnauthorizedException();
      throw new WsException('Invalid credentials');
    }
  }
}
