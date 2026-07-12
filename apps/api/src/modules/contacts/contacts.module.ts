import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { AuthModule } from '../auth/auth.module';
import { BlocksModule } from '../blocks/blocks.module';

@Module({
  imports: [AuthModule, BlocksModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
// NotificationsModule is @Global()
