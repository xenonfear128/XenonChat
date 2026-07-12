import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { ok: true, data: await this.groups.create(user.id, body) };
  }

  @Get(':groupId')
  async get(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return { ok: true, data: await this.groups.get(user.id, groupId) };
  }

  @Patch(':groupId')
  async patch(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: unknown,
  ) {
    return { ok: true, data: await this.groups.updateSettings(user.id, groupId, body) };
  }

  @Patch(':groupId/settings')
  async settings(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: unknown,
  ) {
    return { ok: true, data: await this.groups.updateSettings(user.id, groupId, body) };
  }

  @Get(':groupId/members')
  async members(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return { ok: true, data: await this.groups.listMembers(user.id, groupId) };
  }

  @Post(':groupId/members')
  async invite(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { user_ids: string[] },
  ) {
    return { ok: true, data: await this.groups.invite(user.id, groupId, body.user_ids ?? []) };
  }

  @Delete(':groupId/members/:userId')
  async kick(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return { ok: true, data: await this.groups.kick(user.id, groupId, userId) };
  }

  @Post(':groupId/leave')
  async leave(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return { ok: true, data: await this.groups.leave(user.id, groupId) };
  }

  @Post(':groupId/transfer-owner')
  async transfer(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { user_id: string },
  ) {
    return { ok: true, data: await this.groups.transferOwner(user.id, groupId, body.user_id) };
  }

  @Post(':groupId/admins/:userId')
  async setAdmin(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return { ok: true, data: await this.groups.setAdmin(user.id, groupId, userId, true) };
  }

  @Delete(':groupId/admins/:userId')
  async revokeAdmin(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return { ok: true, data: await this.groups.setAdmin(user.id, groupId, userId, false) };
  }

  @Delete(':groupId')
  async dissolve(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return { ok: true, data: await this.groups.dissolve(user.id, groupId) };
  }

  @Get(':groupId/announcements')
  async listAnnouncements(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return { ok: true, data: await this.groups.listAnnouncements(user.id, groupId) };
  }

  @Post(':groupId/announcements')
  async createAnnouncement(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: unknown,
  ) {
    return { ok: true, data: await this.groups.createAnnouncement(user.id, groupId, body) };
  }

  @Patch(':groupId/announcements/:announcementId')
  async updateAnnouncement(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('announcementId') announcementId: string,
    @Body() body: unknown,
  ) {
    return {
      ok: true,
      data: await this.groups.updateAnnouncement(user.id, groupId, announcementId, body),
    };
  }

  @Delete(':groupId/announcements/:announcementId')
  async deleteAnnouncement(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('announcementId') announcementId: string,
  ) {
    return {
      ok: true,
      data: await this.groups.deleteAnnouncement(user.id, groupId, announcementId),
    };
  }

  @Post(':groupId/announcements/:announcementId/pin')
  async pin(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('announcementId') announcementId: string,
  ) {
    return {
      ok: true,
      data: await this.groups.pinAnnouncement(user.id, groupId, announcementId, true),
    };
  }

  @Delete(':groupId/announcements/:announcementId/pin')
  async unpin(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('announcementId') announcementId: string,
  ) {
    return {
      ok: true,
      data: await this.groups.pinAnnouncement(user.id, groupId, announcementId, false),
    };
  }

  @Get(':groupId/audit-logs')
  async audit(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return { ok: true, data: await this.groups.auditLogs(user.id, groupId) };
  }
}
