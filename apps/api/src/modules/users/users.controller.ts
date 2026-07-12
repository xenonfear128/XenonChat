import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { UsersService } from './users.service';

@Controller()
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users/me')
  async me(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.users.getMe(user.id) };
  }

  @Patch('users/me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { ok: true, data: await this.users.updateMe(user.id, body) };
  }

  @Patch('users/me/privacy')
  async privacy(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { ok: true, data: await this.users.updatePrivacy(user.id, body) };
  }

  @Post('users/me/avatar')
  async avatar(@CurrentUser() user: AuthUser, @Req() req: { file: () => Promise<{ toBuffer: () => Promise<Buffer>; mimetype: string; filename: string } | undefined> }) {
    const file = await req.file();
    if (!file) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'No file' } };
    }
    const buffer = await file.toBuffer();
    return {
      ok: true,
      data: await this.users.setAvatar(user.id, buffer, file.mimetype, file.filename),
    };
  }

  @Get('users/search')
  async search(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return { ok: true, data: await this.users.search(user.id, q) };
  }

  @Get('users/:userId')
  async getUser(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return { ok: true, data: await this.users.getById(user.id, userId) };
  }
}
