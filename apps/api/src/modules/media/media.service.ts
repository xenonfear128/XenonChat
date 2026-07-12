import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AppError } from '../../common/errors/app-error';
import { detectMimeFromBuffer } from '../../common/files/magic';

const ALLOWED: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm'],
  voice: ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'],
  file: [
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  private maxSize() {
    return Number(this.config.get('MAX_UPLOAD_SIZE', 52428800));
  }

  async createUploadUrl(
    userId: string,
    input: { filename: string; mime_type: string; size_bytes: number; kind?: string },
  ) {
    await this.rateLimit.assertUpload(userId);
    if (input.size_bytes > this.maxSize()) {
      throw new AppError(ErrorCodes.FILE_TOO_LARGE, 'File too large');
    }
    const kind = input.kind ?? 'file';
    const allowed = ALLOWED[kind] ?? [...ALLOWED.image, ...ALLOWED.video, ...ALLOWED.voice, ...ALLOWED.file];
    if (!allowed.includes(input.mime_type)) {
      throw new AppError(ErrorCodes.FILE_TYPE_NOT_ALLOWED, 'File type not allowed');
    }
    const safeName = input.filename.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
    const ext = safeName.includes('.') ? safeName.split('.').pop()! : '';
    const key = this.storage.buildKey(`uploads/${userId}`, ext);
    const signed = await this.storage.getSignedUploadUrl(key, input.mime_type);
    const media = await this.prisma.mediaObject.create({
      data: {
        uploaderId: userId,
        storageKey: key,
        bucket: this.storage.getBucket(),
        mimeType: input.mime_type,
        sizeBytes: input.size_bytes,
        originalName: safeName,
        status: 'pending',
      },
    });
    return {
      media_id: media.id,
      upload_url: signed.uploadUrl,
      storage_key: key,
      local: signed.local,
    };
  }

  async complete(userId: string, mediaId: string, meta?: { width?: number; height?: number; duration_ms?: number }) {
    const media = await this.prisma.mediaObject.findFirst({
      where: { id: mediaId, uploaderId: userId },
    });
    if (!media) throw new AppError(ErrorCodes.MEDIA_NOT_FOUND, 'Media not found', 404);
    const updated = await this.prisma.mediaObject.update({
      where: { id: mediaId },
      data: {
        status: 'ready',
        width: meta?.width,
        height: meta?.height,
        durationMs: meta?.duration_ms,
      },
    });
    return {
      id: updated.id,
      mime_type: updated.mimeType,
      size_bytes: updated.sizeBytes,
      original_name: updated.originalName,
      width: updated.width,
      height: updated.height,
      duration_ms: updated.durationMs,
    };
  }

  async uploadDirect(userId: string, buffer: Buffer, mimeType: string, filename: string, kind?: string) {
    await this.rateLimit.assertUpload(userId);
    if (buffer.length > this.maxSize()) {
      throw new AppError(ErrorCodes.FILE_TOO_LARGE, 'File too large');
    }
    const detected = detectMimeFromBuffer(buffer);
    const effectiveMime = detected?.mime ?? mimeType;
    const allowedList = kind
      ? ALLOWED[kind] ?? Object.values(ALLOWED).flat()
      : Object.values(ALLOWED).flat();
    if (!allowedList.includes(effectiveMime) && !allowedList.includes(mimeType)) {
      throw new AppError(ErrorCodes.FILE_TYPE_NOT_ALLOWED, 'File type not allowed');
    }
    const safeName = filename.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
    const ext = detected?.ext ?? (safeName.includes('.') ? safeName.split('.').pop()! : 'bin');
    const key = this.storage.buildKey(`uploads/${userId}`, ext);
    await this.storage.putObject(key, buffer, effectiveMime);
    const media = await this.prisma.mediaObject.create({
      data: {
        uploaderId: userId,
        storageKey: key,
        bucket: this.storage.getBucket(),
        mimeType: effectiveMime,
        sizeBytes: buffer.length,
        originalName: safeName,
        status: 'ready',
        checksum: undefined,
      },
    });
    return {
      id: media.id,
      mime_type: media.mimeType,
      size_bytes: media.sizeBytes,
      original_name: media.originalName,
    };
  }

  async getDownload(userId: string, mediaId: string) {
    const media = await this.prisma.mediaObject.findFirst({
      where: { id: mediaId, deletedAt: null, status: 'ready' },
    });
    if (!media) throw new AppError(ErrorCodes.MEDIA_NOT_FOUND, 'Media not found', 404);
    // Access: uploader or participant of a message that references it
    if (media.uploaderId !== userId) {
      const linked = await this.prisma.messageAttachment.findFirst({
        where: {
          mediaId,
          message: {
            conversation: {
              members: { some: { userId, leftAt: null } },
            },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            revokedAt: null,
          },
        },
      });
      const momentLinked = await this.prisma.momentPostMedia.findFirst({
        where: { mediaId },
      });
      if (!linked && !momentLinked) {
        throw new AppError(ErrorCodes.PERMISSION_DENIED, 'No access', 403);
      }
    }
    const url = await this.storage.getSignedDownloadUrl(media.storageKey);
    return {
      id: media.id,
      url,
      mime_type: media.mimeType,
      size_bytes: media.sizeBytes,
      original_name: media.originalName,
    };
  }

  async localUpload(key: string, buffer: Buffer, contentType: string) {
    await this.storage.putObject(decodeURIComponent(key), buffer, contentType);
    return { success: true };
  }

  async readLocal(key: string) {
    return this.storage.readLocal(decodeURIComponent(key));
  }
}
