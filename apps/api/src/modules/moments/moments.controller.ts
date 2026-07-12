import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { MomentsService } from './moments.service';

@Controller('moments')
@UseGuards(AuthGuard)
export class MomentsController {
  constructor(private readonly moments: MomentsService) {}

  @Get('feed')
  async feed(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      ok: true,
      data: await this.moments.feed(user.id, cursor, limit ? Number(limit) : 20),
    };
  }

  @Post('posts')
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { ok: true, data: await this.moments.create(user.id, body) };
  }

  @Get('posts/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.moments.get(user.id, id) };
  }

  @Delete('posts/:id')
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.moments.delete(user.id, id) };
  }

  @Post('posts/:id/comments')
  async comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return { ok: true, data: await this.moments.comment(user.id, id, body.body ?? '') };
  }

  @Delete('comments/:id')
  async deleteComment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.moments.deleteComment(user.id, id) };
  }

  @Post('posts/:id/reactions')
  async react(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reaction?: string },
  ) {
    return { ok: true, data: await this.moments.react(user.id, id, body.reaction ?? 'like') };
  }

  @Delete('posts/:id/reactions/:reaction')
  async unreact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('reaction') reaction: string,
  ) {
    return { ok: true, data: await this.moments.unreact(user.id, id, reaction) };
  }

  @Post('posts/:id/report')
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return { ok: true, data: await this.moments.report(user.id, id, body.reason ?? 'abuse') };
  }
}
