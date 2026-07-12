import { Module } from '@nestjs/common';
import { MomentsController } from './moments.controller';
import { MomentsService } from './moments.service';
import { AuthModule } from '../auth/auth.module';
import { BlocksModule } from '../blocks/blocks.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [AuthModule, BlocksModule, ContactsModule],
  controllers: [MomentsController],
  providers: [MomentsService],
  exports: [MomentsService],
})
export class MomentsModule {}
