import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import * as cheerio from 'cheerio';
import { ErrorCodes, isPrivateIp, isSafePreviewUrl } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class LinkPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private hashUrl(url: string) {
    return createHash('sha256').update(url).digest('hex');
  }

  private async assertPublicUrl(rawUrl: string) {
    if (!isSafePreviewUrl(rawUrl)) {
      throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'URL not allowed');
    }
    const host = new URL(rawUrl).hostname;
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (
      addresses.length === 0 ||
      addresses.some((entry) => isPrivateIp(entry.address))
    ) {
      throw new AppError(
        ErrorCodes.LINK_PREVIEW_FAILED,
        'Private address blocked',
      );
    }
  }

  private safeMetadataUrl(value: string | null, base: string) {
    if (!value) return null;
    try {
      const resolved = new URL(value, base).toString();
      return isSafePreviewUrl(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  private async readLimited(response: Response, maxBytes: number) {
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > maxBytes) {
      throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'Response too large');
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError(
          ErrorCodes.LINK_PREVIEW_FAILED,
          'Response too large',
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  async fetch(rawUrl: string) {
    await this.assertPublicUrl(rawUrl);

    const urlHash = this.hashUrl(rawUrl);
    const cached = await this.prisma.linkPreview.findUnique({ where: { urlHash } });
    if (cached && cached.expiresAt > new Date()) {
      return {
        ...cached,
        imageUrl: this.safeMetadataUrl(cached.imageUrl, cached.url),
        faviconUrl: this.safeMetadataUrl(cached.faviconUrl, cached.url),
      };
    }

    const timeoutMs = Number(this.config.get('LINK_PREVIEW_TIMEOUT_MS', 3000));
    const maxBytes = Number(this.config.get('LINK_PREVIEW_MAX_BYTES', 1048576));

    let finalUrl = rawUrl;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let redirects = 0;
      let current = rawUrl;
      let response: Response | null = null;

      while (redirects < 3) {
        response = await fetch(current, {
          signal: controller.signal,
          redirect: 'manual',
          headers: { 'User-Agent': 'XenonChatLinkPreview/1.0', Accept: 'text/html' },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers.get('location');
          if (!loc) break;
          const next = new URL(loc, current).toString();
          if (!isSafePreviewUrl(next)) {
            throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'Redirect blocked');
          }
          await this.assertPublicUrl(next);
          current = next;
          redirects += 1;
          continue;
        }
        break;
      }
      clearTimeout(timer);
      if (!response || !response.ok) {
        throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'Fetch failed');
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (
        contentType &&
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml+xml')
      ) {
        throw new AppError(
          ErrorCodes.LINK_PREVIEW_FAILED,
          'Response is not HTML',
        );
      }
      finalUrl = current;
      const buf = await this.readLimited(response, maxBytes);
      const html = buf.toString('utf8');
      const $ = cheerio.load(html);
      const getMeta = (...keys: string[]) => {
        for (const key of keys) {
          const v =
            $(`meta[property="${key}"]`).attr('content') ||
            $(`meta[name="${key}"]`).attr('content');
          if (v) return v.trim();
        }
        return null;
      };

      const title = getMeta('og:title', 'twitter:title') || $('title').first().text().trim() || null;
      const description =
        getMeta('og:description', 'twitter:description', 'description') || null;
      const imageUrl = this.safeMetadataUrl(
        getMeta('og:image', 'twitter:image'),
        finalUrl,
      );
      const siteName = getMeta('og:site_name') || new URL(finalUrl).hostname;
      const favicon = this.safeMetadataUrl(
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href') ||
          null,
        finalUrl,
      );

      const preview = await this.prisma.linkPreview.upsert({
        where: { urlHash },
        create: {
          url: rawUrl,
          urlHash,
          canonicalUrl: finalUrl,
          domain: new URL(finalUrl).hostname,
          title: title?.slice(0, 300) ?? null,
          description: description?.slice(0, 500) ?? null,
          imageUrl,
          faviconUrl: favicon,
          siteName,
          fetchStatus: 'ok',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        update: {
          canonicalUrl: finalUrl,
          domain: new URL(finalUrl).hostname,
          title: title?.slice(0, 300) ?? null,
          description: description?.slice(0, 500) ?? null,
          imageUrl,
          faviconUrl: favicon,
          siteName,
          fetchStatus: 'ok',
          errorReason: null,
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return preview;
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'unknown';
      return this.prisma.linkPreview.upsert({
        where: { urlHash },
        create: {
          url: rawUrl,
          urlHash,
          fetchStatus: 'error',
          errorReason: reason.slice(0, 200),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        update: {
          fetchStatus: 'error',
          errorReason: reason.slice(0, 200),
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    }
  }
}
