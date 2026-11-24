import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import type { RuntimeConfig } from '../config/schema.js';
import { applyMigrations } from './migrations.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private connection: Database.Database | undefined;
  private client: BetterSQLite3Database | undefined;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit(): void {
    const runtime = this.config.getOrThrow<RuntimeConfig>('runtime');
    mkdirSync(runtime.dataDir, { recursive: true, mode: 0o700 });
    const connection = new Database(join(runtime.dataDir, 'coseed.sqlite'));
    try {
      connection.pragma('journal_mode = WAL');
      connection.pragma('foreign_keys = ON');
      connection.pragma('busy_timeout = 5000');
      applyMigrations(connection);
      this.client = drizzle(connection);
      this.connection = connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  get db(): BetterSQLite3Database {
    if (!this.client) throw new Error('数据库尚未初始化');
    return this.client;
  }

  ping(): boolean {
    return this.db.get<{ ok: number }>(sql`select 1 as ok`)?.ok === 1;
  }

  onModuleDestroy(): void {
    this.connection?.close();
    this.connection = undefined;
    this.client = undefined;
  }
}
