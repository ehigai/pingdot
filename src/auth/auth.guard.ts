import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { authErrorConstants, jwtConstants } from './constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.public';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class AuthGuard implements CanActivate {
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

    let token: string | undefined;
    let container: any;
    let type: 'http' | 'ws' = 'http';

    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<Request>();
      token = this.extractTokenFromHeader(req);
      container = req; // so we can attach req.user later
      type = 'http';
    }

    if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient();
      token = this.extractTokenFromWs(client);
      container = client; // so we can attach client.
      type = 'ws';
    }

    return this.validate(token, container, type);
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private extractTokenFromWs(client: any): string | undefined {
    const headerAuth = client.handshake?.headers?.authorization;
    if (headerAuth) {
      const [type, token] = headerAuth.split(' ');
      if (type === 'Bearer') return token;
    }
    return client.handshake?.query?.token as string | undefined;
  }

  private async validate(
    token: string | undefined,
    container: any,
    type: 'http' | 'ws',
  ): Promise<boolean> {
    if (!token) {
      throw new UnauthorizedException({
        status: 401,
        errorCode: authErrorConstants.invalidAccessToken,
        message: 'Unauthorized',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });

      // Attach user payload for downstream use
      container.user = payload;
    } catch (error) {
      if (type === 'http') {
        throw new UnauthorizedException();
      }
      throw new WsException('Invalid credentials');
    }

    return true;
  }
}
