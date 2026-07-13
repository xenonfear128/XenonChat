import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  providers: [RetentionService],
})
export class RetentionModule {}
