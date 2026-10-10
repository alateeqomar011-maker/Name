import "server-only";
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { env } from "../env";
import * as schema from "./schema";

// Postgres in production (DATABASE_URL). For local development without a
// database server we run embedded Postgres (PGlite) persisted under DATA_DIR.
// Both share the same schema and SQL migrations.

export type DB = NodePgDatabase<typeof schema>;

interface DbState {
  db: DB;
  ready: Promise<void>;
}

const globalForDb = globalThis as unknown as { __vitrineDb?: DbState };

function migrationsFolder() {
  return process.env.MIGRATIONS_DIR ? path.resolve(process.env.MIGRATIONS_DIR) : path.join(process.cwd(), "drizzle");
}

async function createDb(): Promise<DbState> {
  if (env.databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });
    const db = drizzlePg({ client: pool, schema });
    const ready = migratePg(db, { migrationsFolder: migrationsFolder() });
    return { db, ready };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(env.dataDir, "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite({ client, schema }) as unknown as DB;
  const ready = migratePglite(drizzlePglite({ client, schema }), { migrationsFolder: migrationsFolder() });
  return { db, ready };
}

let pending: Promise<DbState> | null = null;

/** Returns the migrated database client (singleton per process). */
export async function getDb(): Promise<DB> {
  if (globalForDb.__vitrineDb) {
    await globalForDb.__vitrineDb.ready;
    return globalForDb.__vitrineDb.db;
  }
  if (!pending) {
    pending = createDb().then(async (state) => {
      globalForDb.__vitrineDb = state;
      await state.ready;
      const { recoverInterruptedJobs } = await import("../jobs/recovery");
      await recoverInterruptedJobs(state.db);
      const sweeper = setInterval(() => {
        recoverInterruptedJobs(state.db).catch((err) => console.error("[jobs] sweep failed", err));
      }, 60_000);
      sweeper.unref?.();
      return state;
    });
  }
  const state = await pending;
  return state.db;
}

export { schema };
