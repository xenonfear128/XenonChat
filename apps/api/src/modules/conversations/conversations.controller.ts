import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.conversations.listForUser(user.id) };
  }

  @Post('direct')
  async createDirect(@CurrentUser() user: AuthUser, @Body() body: { user_id: string }) {
    return { ok: true, data: await this.conversations.getOrCreateDirect(user.id, body.user_id) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.conversations.getForUser(user.id, id) };
  }

  @Patch(':id/settings')
  async settings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return { ok: true, data: await this.conversations.updateDirectSettings(user.id, id, body) };
  }

  @Post(':id/pin')
  async pin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.conversations.pin(user.id, id, true) };
  }

  @Delete(':id/pin')
  async unpin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.conversations.pin(user.id, id, false) };
  }

  @Post(':id/mute')
  async mute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.conversations.mute(user.id, id, true) };
  }

  @Delete(':id/mute')
  async unmute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.conversations.mute(user.id, id, false) };
  }

  @Post(':id/read')
  async read(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { message_id?: string },
  ) {
    return { ok: true, data: await this.conversations.markRead(user.id, id, body?.message_id) };
  }
}
