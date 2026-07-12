import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { ContactsService } from './contacts.service';

@Controller('contacts')
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.contacts.list(user.id) };
  }

  @Post('requests')
  async send(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { ok: true, data: await this.contacts.sendRequest(user.id, body) };
  }

  @Get('requests')
  async requests(@CurrentUser() user: AuthUser) {
    return { ok: true, data: await this.contacts.listRequests(user.id) };
  }

  @Post('requests/:id/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.contacts.accept(user.id, id) };
  }

  @Post('requests/:id/reject')
  async reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.contacts.reject(user.id, id) };
  }

  @Delete(':userId')
  async remove(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return { ok: true, data: await this.contacts.remove(user.id, userId) };
  }

  @Patch(':userId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() body: { remark?: string },
  ) {
    return { ok: true, data: await this.contacts.updateRemark(user.id, userId, body.remark) };
  }
}
