import { Module, forwardRef } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { BlocksModule } from '../blocks/blocks.module';
import { LinkPreviewModule } from '../link-preview/link-preview.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    AuthModule,
    ConversationsModule,
    BlocksModule,
    LinkPreviewModule,
    forwardRef(() => RealtimeModule),
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
