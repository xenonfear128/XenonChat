import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    return { ok: true, data: await this.auth.register(body) };
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return {
      ok: true,
      data: await this.auth.login(body, req.ip, req.headers['user-agent']),
    };
  }

  @Post('refresh')
  async refresh(@Body() body: { refresh_token?: string }) {
    return { ok: true, data: await this.auth.refresh(body.refresh_token ?? '') };
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.auth.logout(user) };
  }

  @Get('devices')
  @UseGuards(AuthGuard)
  async devices(@CurrentUser() user: AuthUser) {
    return {
      ok: true,
      data: await this.auth.listDevices(user.id, user.sessionId),
    };
  }

  @Delete('devices/:deviceId')
  @UseGuards(AuthGuard)
  async revokeDevice(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return { ok: true, data: await this.auth.revokeDevice(user.id, deviceId, user.sessionId) };
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: { current_password: string; new_password: string },
  ) {
    return {
      ok: true,
      data: await this.auth.changePassword(user.id, body.current_password, body.new_password),
    };
  }

  @Post('reset-password/request')
  async requestPasswordReset(@Body() body: { email?: string }) {
    return {
      ok: true,
      data: await this.auth.requestPasswordReset(body.email ?? ''),
    };
  }

  @Post('reset-password/confirm')
  async confirmPasswordReset(
    @Body() body: { token?: string; new_password?: string },
  ) {
    return {
      ok: true,
      data: await this.auth.confirmPasswordReset(
        body.token ?? '',
        body.new_password ?? '',
      ),
    };
  }
}
