import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.notifications.list(user.id) };
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { ok: true, data: { count: await this.notifications.unreadCount(user.id) } };
  }

  @Post('read')
  async readAll(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.notifications.markRead(user.id) };
  }

  @Post(':id/read')
  async readOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.notifications.markRead(user.id, id) };
  }
}
