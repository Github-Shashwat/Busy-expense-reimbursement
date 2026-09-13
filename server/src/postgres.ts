import 'dotenv/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

const poolMax = Number(process.env.PG_POOL_MAX || 5);

export const databaseUrl = process.env.DATABASE_URL;

export const pgPool = new Pool({
  connectionString: databaseUrl,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: process.env.NODE_ENV === 'test',
});

export function assertDatabaseUrl() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL persistence');
  }
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return pgPool.query<T>(text, values);
}

export async function withPgTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
