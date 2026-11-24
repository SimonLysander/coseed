import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { serviceStatusSchema, type ServiceStatus } from '../../../contracts/service-status.js';
import { DatabaseService } from '../../database/database.service.js';
import { packageVersion } from '../../package-info.js';

@Controller('api/status')
export class StatusController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  getStatus(): ServiceStatus {
    if (!this.database.ping()) throw new ServiceUnavailableException('数据库不可用');
    return serviceStatusSchema.parse({
      name: 'CoSeed',
      version: packageVersion,
      status: 'ready',
      storage: 'ready',
    });
  }
}
