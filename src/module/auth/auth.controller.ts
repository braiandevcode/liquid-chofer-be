import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../core/common/decorators/current-user.decorator.js';
import type { IAuthUser } from '../../shared/types/auth.types.js';
import { AuthService, REFRESH_COOKIE_NAME } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { UpdateProfileDto } from '../users/dto/update-profile.dto.js';
import { ApiBasePath, AuthEndpoint } from '../../core/config/config.endpoints.js';

// Endpoints publicos y autenticados de sesion bajo api/v1/auth.
@Controller(ApiBasePath.AUTH)
@UseGuards(ThrottlerGuard) // a nivel de clase
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // Recibe el ID token de Firebase y devuelve accessToken + setea refresh cookie.
  @Post(AuthEndpoint.LOGIN)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto.idToken, res);
  }

  // Renueva accessToken usando refresh cookie.
  @Post(AuthEndpoint.REFRESH)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    return this.authService.refresh(refreshToken, res);
  }

  // Devuelve los datos del usuario autenticado (requiere accessToken Bearer).
  @Get(AuthEndpoint.ME)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: IAuthUser) {
    return this.authService.me(user);
  }

  @Post(AuthEndpoint.LOGOUT)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    return this.authService.logout(res, refreshToken);
  }

  // Elimina la cuenta del usuario autenticado (requiere reautenticacion reciente).
  @Delete(AuthEndpoint.ACCOUNT)
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  deleteAccount(
    @CurrentUser() user: IAuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.deleteAccount(user, dto.idToken, res);
  }

  // Edita el nombre visible del usuario autenticado.
  @Patch(AuthEndpoint.ME)
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  updateProfile(@CurrentUser() user: IAuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user, dto.displayName);
  }
}
