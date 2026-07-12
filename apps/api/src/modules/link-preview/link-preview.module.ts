import { Module } from '@nestjs/common';
import { LinkPreviewService } from './link-preview.service';
import { LinkPreviewController } from './link-preview.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService],
  exports: [LinkPreviewService],
})
export class LinkPreviewModule {}
