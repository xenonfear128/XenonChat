import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanupBatch();
    }, 60_000);
    void this.cleanupBatch();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanupBatch(batchSize = 200) {
    const now = new Date();
    const expired = await this.prisma.message.findMany({
      where: {
        expiresAt: { lte: now },
        messageType: { not: 'deleted' },
      },
      take: batchSize,
      include: {
        attachments: { include: { media: true } },
        quote: true,
      },
    });

    for (const msg of expired) {
      try {
        for (const att of msg.attachments) {
          await this.storage.deleteObject(att.media.storageKey);
          await this.prisma.mediaObject.update({
            where: { id: att.media.id },
            data: { deletedAt: now, status: 'deleted' },
          });
        }
        // High-privacy: clear quote snapshots that reference this message
        await this.prisma.messageQuote.updateMany({
          where: { quotedMessageId: msg.id },
          data: {
            snapshotText: null,
            originalExpired: true,
          },
        });
        await this.prisma.message.update({
          where: { id: msg.id },
          data: {
            messageType: 'deleted',
            body: null,
            deletedAt: now,
          },
        });
        await this.prisma.messageAttachment.deleteMany({ where: { messageId: msg.id } });
        await this.prisma.messageLinkPreview.deleteMany({ where: { messageId: msg.id } });
      } catch (e) {
        this.logger.warn(`Failed cleanup for message ${msg.id}: ${String(e)}`);
      }
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} expired messages`);
    }
    return expired.length;
  }
}
