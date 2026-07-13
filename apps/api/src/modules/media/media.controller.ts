import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, AuthUser } from '../../common/auth/auth.guard';
import { MediaService } from './media.service';
import { FastifyReply } from 'fastify';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  @UseGuards(AuthGuard)
  async uploadUrl(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { filename: string; mime_type: string; size_bytes: number; kind?: string },
  ) {
    return { ok: true, data: await this.media.createUploadUrl(user.id, body) };
  }

  @Post('complete')
  @UseGuards(AuthGuard)
  async complete(
    @CurrentUser() user: AuthUser,
    @Body() body: { media_id: string; width?: number; height?: number; duration_ms?: number },
  ) {
    return {
      ok: true,
      data: await this.media.complete(user.id, body.media_id, body),
    };
  }

  @Post('upload')
  @UseGuards(AuthGuard)
  async upload(
    @CurrentUser() user: AuthUser,
    @Req()
    req: {
      file: () => Promise<
        | { toBuffer: () => Promise<Buffer>; mimetype: string; filename: string; fields?: Record<string, { value: string }> }
        | undefined
      >;
    },
  ) {
    const file = await req.file();
    if (!file) return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'No file' } };
    const buffer = await file.toBuffer();
    const kind = file.fields?.kind?.value;
    return {
      ok: true,
      data: await this.media.uploadDirect(user.id, buffer, file.mimetype, file.filename, kind),
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { ok: true, data: await this.media.getDownload(user.id, id) };
  }

  @Put('local-upload/:token')
  async localUpload(
    @Param('token') token: string,
    @Req() req: { body: Buffer; headers: Record<string, string> },
  ) {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
    await this.media.localUpload(
      token,
      buffer,
      req.headers['content-type'] ?? 'application/octet-stream',
    );
    return { ok: true, data: { success: true } };
  }

  @Get('local/:token')
  async localGet(@Param('token') token: string, @Res() reply: FastifyReply) {
    const buf = await this.media.readLocal(token);
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(buf);
  }
}
