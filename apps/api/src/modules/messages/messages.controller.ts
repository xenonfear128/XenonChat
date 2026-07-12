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
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations/:id/messages')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      ok: true,
      data: await this.messages.listMessages(user.id, id, {
        before,
        after,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('messages')
  async send(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { ok: true, data: await this.messages.send(user.id, body) };
  }

  @Post('messages/:id/revoke')
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.messages.revoke(user.id, id) };
  }

  @Delete('messages/:id')
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.messages.deleteForMe(user.id, id) };
  }

  @Post('messages/:id/report')
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return { ok: true, data: await this.messages.report(user.id, id, body.reason ?? 'abuse') };
  }
}
