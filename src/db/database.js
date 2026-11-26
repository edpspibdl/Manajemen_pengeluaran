import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { MIGRATIONS } from './migrations.js';
import { seedMasterData } from './seeders.js';
import { toIsoUtc } from '../utils/date.js';

const DB_NAME = 'kosmate_db';
const IDB_STORE_KEY = 'kosmate_sqlite_binary_v1';

/**
 * Unified SQLite adapter supporting:
 * - Native Android via @capacitor-community/sqlite
 * - Web/Browser via sql.js (WASM) persisted in IndexedDB
 * - Node/Vitest in-memory via sql.js
 */
export class DatabaseAdapter {
  /**
   * @param {{ mode?: 'auto'|'native'|'web'|'memory', persist?: boolean }} [options]
   */
  constructor(options = {}) {
    this.mode = options.mode || 'auto';
    this.persist = options.persist !== undefined ? options.persist : true;
    this.isNative = false;
    this.sqlJsDb = null;
    this.txDepth = 0;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    const nativeCheck =
      this.mode === 'native' ||
      (this.mode === 'auto' && typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform());

    if (nativeCheck) {
      this.isNative = true;
      await this._initNative();
    } else {
      this.isNative = false;
      await this._initSqlJs();
    }

    await this.execute('PRAGMA foreign_keys = ON;');
    await this._runMigrations();
    await seedMasterData(this);
    await this._persistWeb();

    this.initialized = true;
  }

  async _initNative() {
    const existsRes = await CapacitorSQLite.isDBExists({ database: DB_NAME }).catch(() => ({ result: false }));
    if (!existsRes.result) {
      await CapacitorSQLite.createConnection({
        database: DB_NAME,
        encrypted: false,
        mode: 'no-encryption',
        version: 1,
        readonly: false
      });
    } else {
      const isOpenRes = await CapacitorSQLite.isDBOpen({ database: DB_NAME }).catch(() => ({ result: false }));
      if (!isOpenRes.result) {
        await CapacitorSQLite.createConnection({
          database: DB_NAME,
          encrypted: false,
          mode: 'no-encryption',
          version: 1,
          readonly: false
        }).catch(() => {});
      }
    }
    await CapacitorSQLite.open({ database: DB_NAME, readonly: false });
  }

  async _initSqlJs() {
    const mod = await import('sql.js');
    const initSqlJs = typeof mod.default === 'function' ? mod.default : mod;

    let sqlConfig;
    if (typeof window !== 'undefined' && this.mode !== 'memory') {
      const wasmMod = await import('sql.js/dist/sql-wasm-browser.wasm?url');
      sqlConfig = { locateFile: () => wasmMod.default };
    }

    const SQL = await initSqlJs(sqlConfig);

    let savedBytes = null;
    if (this.persist && this.mode !== 'memory' && typeof indexedDB !== 'undefined') {
      savedBytes = await idbGet(IDB_STORE_KEY).catch(() => null);
    }

    if (savedBytes instanceof Uint8Array && savedBytes.length > 0) {
      this.sqlJsDb = new SQL.Database(savedBytes);
    } else {
      this.sqlJsDb = new SQL.Database();
    }
  }

  async _persistWeb() {
    if (this.isNative || !this.persist || this.mode === 'memory' || this.txDepth > 0) {
      return;
    }
    if (this.sqlJsDb && typeof indexedDB !== 'undefined') {
      const data = this.sqlJsDb.export();
      await idbSet(IDB_STORE_KEY, data);
    }
  }

  async _runMigrations() {
    await this.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedRows = await this.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(appliedRows.map((r) => Number(r.version)));

    for (const migration of MIGRATIONS) {
      if (appliedSet.has(migration.version)) continue;
      await this.transaction(async () => {
        for (const stmt of migration.statements) {
          await this.execute(stmt);
        }
        await this.run(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, toIsoUtc()]
        );
      });
    }
  }

  /**
   * Execute DDL or statement batches without return rows.
   * @param {string} sql
   */
  async execute(sql) {
    if (this.isNative) {
      await CapacitorSQLite.execute({ database: DB_NAME, statements: sql, transaction: false });
      return;
    }
    this.sqlJsDb.exec(sql);
  }

  /**
   * Execute a single parameterized write statement (INSERT, UPDATE, DELETE).
   * @param {string} sql
   * @param {any[]} [params]
   */
  async run(sql, params = []) {
    if (this.isNative) {
      await CapacitorSQLite.run({ database: DB_NAME, statement: sql, values: params, transaction: false });
      return;
    }
    const stmt = this.sqlJsDb.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
    await this._persistWeb();
  }

  /**
   * Query rows as plain objects.
   * @param {string} sql
   * @param {any[]} [params]
   * @returns {Promise<Record<string, any>[]>}
   */
  async query(sql, params = []) {
    if (this.isNative) {
      const res = await CapacitorSQLite.query({ database: DB_NAME, statement: sql, values: params });
      return res.values || [];
    }
    const stmt = this.sqlJsDb.prepare(sql);
    const rows = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  /**
   * Query single row or null.
   * @param {string} sql
   * @param {any[]} [params]
   * @returns {Promise<Record<string, any> | null>}
   */
  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Execute callback inside an atomic SQLite transaction (supports nesting).
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async transaction(fn) {
    const isOutermost = this.txDepth === 0;
    this.txDepth += 1;

    if (isOutermost) {
      if (this.isNative) {
        await CapacitorSQLite.beginTransaction({ database: DB_NAME });
      } else {
        this.sqlJsDb.run('BEGIN TRANSACTION;');
      }
    }

    try {
      const result = await fn();
      if (isOutermost) {
        if (this.isNative) {
          await CapacitorSQLite.commitTransaction({ database: DB_NAME });
        } else {
          this.sqlJsDb.run('COMMIT;');
        }
      }
      this.txDepth -= 1;
      if (isOutermost) {
        await this._persistWeb();
      }
      return result;
    } catch (err) {
      if (isOutermost) {
        if (this.isNative) {
          await CapacitorSQLite.rollbackTransaction({ database: DB_NAME }).catch(() => {});
        } else {
          this.sqlJsDb.run('ROLLBACK;');
        }
      }
      this.txDepth -= 1;
      throw err;
    }
  }

  /**
   * Wipe all user data and re-seed master data (for restore or factory reset).
   * @param {() => Promise<void>} [beforeReseedFn]
   */
  async resetAllData(beforeReseedFn) {
    const tablesToClear = [
      'meal_plans',
      'planned_expenses',
      'transactions',
      'recurring_expenses',
      'budgets',
      'savings_goals',
      'food_preferences',
      'food_items',
      'categories',
      'wallets',
      'financial_periods',
      'users',
      'settings'
    ];

    await this.transaction(async () => {
      await this.execute('PRAGMA foreign_keys = OFF;');
      for (const table of tablesToClear) {
        await this.run(`DELETE FROM ${table}`);
      }
      await this.execute('PRAGMA foreign_keys = ON;');
      if (beforeReseedFn) {
        await beforeReseedFn();
      } else {
        await seedMasterData(this);
      }
    });
  }
}

let sharedDb = null;

/**
 * Get singleton application database adapter.
 * @returns {DatabaseAdapter}
 */
export function getDatabase() {
  if (!sharedDb) {
    sharedDb = new DatabaseAdapter({ mode: 'auto', persist: true });
  }
  return sharedDb;
}

/**
 * Create an isolated in-memory SQLite instance for automated tests.
 * @returns {Promise<DatabaseAdapter>}
 */
export async function createTestDatabase() {
  const db = new DatabaseAdapter({ mode: 'memory', persist: false });
  await db.init();
  return db;
}
