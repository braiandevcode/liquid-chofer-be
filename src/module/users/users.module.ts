import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../shared/entities/user.entity.js';
import { UsersService } from './users.service.js';

// Modulo de usuarios: expone el repositorio de UserEntity y el servicio.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
