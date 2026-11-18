import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service.js';

// Modulo global: expone FirebaseService a cualquier modulo sin reimportarlo.
@Global()
@Module({
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
