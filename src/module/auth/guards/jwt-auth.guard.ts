import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtHelper, IJwtPayload } from '../../../shared/auth/jwt.helper.js';
import { IAuthUser } from '../../../shared/types/auth.types.js';
import { UsersService } from '../../users/users.service.js';

// Guard que protege endpoints con access token JWT (Bearer).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtHelper: JwtHelper,
    private readonly usersService: UsersService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token: string | null = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No estás autenticado.');
    }

    const payload: IJwtPayload = this.jwtHelper.verify(token);

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.firebaseUid !== payload.firebaseUid) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    const authUser: IAuthUser = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
    };

    (request as unknown as { authToken: string }).authToken = token;
    (request as unknown as { user: IAuthUser }).user = authUser;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }
}
