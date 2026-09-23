import pg from "pg";
import { SCHEMA_SQL } from "./schema.js";

const { Pool } = pg;

/**
 * Thin query interface every repository depends on. Production is backed
 * by a real `pg.Pool` (Neon Postgres); tests back the same interface with
 * an in-memory pg-mem pool, so repository code and its Postgres dialect
 * never diverge between the two.
 */
export interface Database {
  query<T = unknown>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

class PgDatabase implements Database {
  constructor(private readonly pool: pg.Pool) {}

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function isLocalConnection(connectionString: string): boolean {
  return /localhost|127\.0\.0\.1/.test(connectionString);
}

/** Opens a pooled Postgres connection and applies the schema (idempotent). */
export async function openDatabase(connectionString: string): Promise<Database> {
  const pool = new Pool({
    connectionString,
    // Neon (and most managed Postgres providers) terminate SSL behind a
    // connection pooler whose certificate chain Node's default trust
    // store doesn't always resolve cleanly - this is the standard
    // node-postgres workaround. Local development databases don't use
    // SSL at all.
    ssl: isLocalConnection(connectionString) ? false : { rejectUnauthorized: false },
    max: 5,
  });
  const db = new PgDatabase(pool);
  await db.query(SCHEMA_SQL);
  return db;
}

/** Wraps an already-constructed pg-compatible Pool (used by tests with pg-mem). */
export function wrapPool(pool: pg.Pool): Database {
  return new PgDatabase(pool);
}
