import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { GroupsModule } from './modules/groups/groups.module';
import { MediaModule } from './modules/media/media.module';
import { LinkPreviewModule } from './modules/link-preview/link-preview.module';
import { MomentsModule } from './modules/moments/moments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RetentionModule } from './modules/retention/retention.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    RedisModule,
    StorageModule,
    RateLimitModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    BlocksModule,
    ConversationsModule,
    MessagesModule,
    GroupsModule,
    MediaModule,
    LinkPreviewModule,
    MomentsModule,
    NotificationsModule,
    RealtimeModule,
    RetentionModule,
  ],
})
export class AppModule {}
