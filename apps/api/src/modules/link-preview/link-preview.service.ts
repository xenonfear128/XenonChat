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

  async fetch(rawUrl: string) {
    if (!isSafePreviewUrl(rawUrl)) {
      throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'URL not allowed');
    }

    const urlHash = this.hashUrl(rawUrl);
    const cached = await this.prisma.linkPreview.findUnique({ where: { urlHash } });
    if (cached && cached.expiresAt > new Date()) {
      return cached;
    }

    const timeoutMs = Number(this.config.get('LINK_PREVIEW_TIMEOUT_MS', 3000));
    const maxBytes = Number(this.config.get('LINK_PREVIEW_MAX_BYTES', 1048576));

    let finalUrl = rawUrl;
    try {
      // Resolve DNS and block private IPs (SSRF)
      const u = new URL(rawUrl);
      const resolved = await lookup(u.hostname);
      if (isPrivateIp(resolved.address) || isPrivateIp(u.hostname)) {
        throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'Private address blocked');
      }

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
          const nextHost = new URL(next).hostname;
          const nextIp = await lookup(nextHost);
          if (isPrivateIp(nextIp.address) || isPrivateIp(nextHost)) {
            throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'Redirect to private IP');
          }
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
      finalUrl = current;
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > maxBytes) {
        throw new AppError(ErrorCodes.LINK_PREVIEW_FAILED, 'Response too large');
      }
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
      const imageUrl = getMeta('og:image', 'twitter:image') || null;
      const siteName = getMeta('og:site_name') || new URL(finalUrl).hostname;
      const favicon =
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href') ||
        null;

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
          faviconUrl: favicon ? new URL(favicon, finalUrl).toString() : null,
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
          faviconUrl: favicon ? new URL(favicon, finalUrl).toString() : null,
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
