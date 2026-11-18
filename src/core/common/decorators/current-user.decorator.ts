import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IAuthUser } from '../../../shared/types/auth.types.js';

const paramCtx = (_data: unknown, ctx: ExecutionContext): IAuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: IAuthUser }>();
  return request.user;
}

// Decorador para obtener el usuario autenticado dentro de un controller.
export const CurrentUser = createParamDecorator(paramCtx);
