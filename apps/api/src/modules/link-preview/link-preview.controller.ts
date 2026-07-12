import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { LinkPreviewService } from './link-preview.service';

@Controller('link-preview')
@UseGuards(AuthGuard)
export class LinkPreviewController {
  constructor(private readonly linkPreview: LinkPreviewService) {}

  @Post()
  async create(@Body() body: { url: string }) {
    const preview = await this.linkPreview.fetch(body.url);
    return {
      ok: true,
      data: {
        id: preview.id,
        url: preview.url,
        domain: preview.domain,
        title: preview.title,
        description: preview.description,
        image_url: preview.imageUrl,
        site_name: preview.siteName,
        favicon_url: preview.faviconUrl,
        fetch_status: preview.fetchStatus,
      },
    };
  }

  @Get()
  async get(@Query('url') url: string) {
    const preview = await this.linkPreview.fetch(url);
    return {
      ok: true,
      data: {
        id: preview.id,
        url: preview.url,
        domain: preview.domain,
        title: preview.title,
        description: preview.description,
        image_url: preview.imageUrl,
        site_name: preview.siteName,
        favicon_url: preview.faviconUrl,
        fetch_status: preview.fetchStatus,
      },
    };
  }
}
