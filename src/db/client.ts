import pg from "pg";
import { SCHEMA_SQL } from "./schema.js";

const { Pool } = pg;

/**
 * Thin query interface every repository depends on. Production is backed
 * by a real `pg.Pool` (Supabase/any Postgres); tests back the same interface with
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

/**
 * Recent pg-connection-string versions parse an `sslmode=require` query
 * param into strict certificate-verification SSL options, which then wins
 * over an explicit `ssl` option passed to `Pool` and breaks against
 * managed Postgres providers (Neon, Supabase) whose pooler certificate
 * chains Node's default trust store doesn't resolve. Stripping SSL-related
 * query params here means our explicit `ssl` option below is the only
 * source of truth. Uses the URL API rather than a regex so it correctly
 * removes every matching param regardless of order or adjacency (Neon's
 * default connection strings include both `sslmode` and `channel_binding`
 * back-to-back, which a naive regex can under-strip).
 */
export function stripSslParams(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");
  return url.toString();
}

/** Opens a pooled Postgres connection. Run `npm run migrate` separately to apply the schema. */
export async function openDatabase(connectionString: string): Promise<Database> {
  const pool = new Pool({
    connectionString: stripSslParams(connectionString),
    // Local development databases don't use SSL at all; managed providers
    // do, but with certificate chains Node's default trust store doesn't
    // always resolve cleanly - this is the standard node-postgres
    // workaround for that.
    ssl: isLocalConnection(connectionString) ? false : { rejectUnauthorized: false },
    // Kept small deliberately: on Vercel each cold-started Fluid Compute
    // instance opens its own pool and holds it for the instance's
    // lifetime (nothing ever calls pool.end() there), so a bursty period
    // of concurrent cold starts multiplies this number by however many
    // instances spin up. A low per-instance ceiling keeps that bounded
    // well under managed-Postgres connection limits.
    max: 3,
  });
  return new PgDatabase(pool);
}

/** Applies the schema (idempotent - safe to run repeatedly). Called explicitly via `npm run migrate`, not on every request. */
export async function applySchema(db: Database): Promise<void> {
  await db.query(SCHEMA_SQL);
}

/** Wraps an already-constructed pg-compatible Pool (used by tests with pg-mem). */
export function wrapPool(pool: pg.Pool): Database {
  return new PgDatabase(pool);
}

/** True if `error` is a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
