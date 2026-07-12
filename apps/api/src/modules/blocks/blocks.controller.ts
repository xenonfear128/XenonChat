import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { BlocksService } from './blocks.service';

@Controller('blocks')
@UseGuards(AuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.blocks.list(user.id) };
  }

  @Post(':userId')
  async block(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    return { ok: true, data: await this.blocks.block(user.id, userId, body?.reason) };
  }

  @Delete(':userId')
  async unblock(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return { ok: true, data: await this.blocks.unblock(user.id, userId) };
  }
}
