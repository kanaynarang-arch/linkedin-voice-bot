/**
 * node-postgres returns TIMESTAMPTZ columns as native `Date` objects (unlike
 * the TEXT-based SQLite driver this project used to run on), but every
 * domain type in this app expects `createdAt` as an ISO string. Repository
 * row-mapping functions call this so that conversion lives in exactly one
 * place instead of leaking `Date` handling into formatting/domain code.
 */
export function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
