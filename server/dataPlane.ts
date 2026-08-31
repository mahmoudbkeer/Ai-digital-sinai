import { AsyncLocalStorage } from "node:async_hooks";
import { getDatabase, type AppDatabase } from "./database";
import { getPostgresPool, migratePostgres, isPostgresUrl } from "./postgres";
import type { PoolClient, QueryResultRow } from "pg";

export type AsyncStatement = {
  get<T extends QueryResultRow = QueryResultRow>(
    ...parameters: unknown[]
  ): Promise<T | undefined>;
  all<T extends QueryResultRow = QueryResultRow>(
    ...parameters: unknown[]
  ): Promise<T[]>;
  run(...parameters: unknown[]): Promise<{ changes: number }>;
};

export type AsyncDataPlane = {
  provider: "sqlite" | "postgresql";
  prepare(sql: string): AsyncStatement;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
};

const postgresTransactions = new AsyncLocalStorage<PoolClient>();
let dataPlane: AsyncDataPlane | undefined;
let postgresReady: Promise<void> | undefined;

function qmarkToPostgres(sql: string) {
  let index = 0;
  let quote: "'" | '"' | null = null;
  let output = "";
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position];
    if (quote) {
      output += character;
      if (character === quote && sql[position + 1] === quote) {
        output += sql[++position];
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
      continue;
    }
    output += character === "?" ? `$${++index}` : character;
  }
  return output;
}

function sqlitePlane(): AsyncDataPlane {
  const db = getDatabase();
  return {
    provider: "sqlite",
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        async get<T extends QueryResultRow = QueryResultRow>(
          ...parameters: unknown[]
        ) {
          return statement.get(...parameters) as T | undefined;
        },
        async all<T extends QueryResultRow = QueryResultRow>(
          ...parameters: unknown[]
        ) {
          return statement.all(...parameters) as T[];
        },
        async run(...parameters: unknown[]) {
          const result = statement.run(...parameters) as { changes?: number };
          return { changes: result.changes ?? 0 };
        },
      };
    },
    async transaction<T>(fn: () => Promise<T>) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function postgresPlane(): AsyncDataPlane {
  return {
    provider: "postgresql",
    prepare(sql) {
      const text = qmarkToPostgres(sql);
      const query = async (parameters: unknown[]) => {
        const client = postgresTransactions.getStore();
        return client
          ? client.query(text, parameters)
          : getPostgresPool().query(text, parameters);
      };
      return {
        async get<T extends QueryResultRow = QueryResultRow>(
          ...parameters: unknown[]
        ) {
          const result = await query(parameters);
          return result.rows[0] as T | undefined;
        },
        async all<T extends QueryResultRow = QueryResultRow>(
          ...parameters: unknown[]
        ) {
          const result = await query(parameters);
          return result.rows as T[];
        },
        async run(...parameters: unknown[]) {
          const result = await query(parameters);
          return { changes: result.rowCount ?? 0 };
        },
      };
    },
    async transaction<T>(fn: () => Promise<T>) {
      const client = await getPostgresPool().connect();
      try {
        await client.query("BEGIN");
        const result = await postgresTransactions.run(client, fn);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function getDataPlane(): AsyncDataPlane {
  if (dataPlane) return dataPlane;
  if (isPostgresUrl()) {
    dataPlane = postgresPlane();
    postgresReady ??= migratePostgres();
    return dataPlane;
  }
  dataPlane = sqlitePlane();
  return dataPlane;
}

export async function ensureDataPlaneReady() {
  if (isPostgresUrl()) {
    postgresReady ??= migratePostgres();
    await postgresReady;
    return;
  }
  getDataPlane();
}

export function resetDataPlaneForTests() {
  dataPlane = undefined;
  postgresReady = undefined;
}

export async function withDataPlaneTransaction<T>(
  db: AsyncDataPlane,
  fn: () => Promise<T>
): Promise<T> {
  return db.transaction(fn);
}

export function isPostgresDataPlane() {
  return getDataPlane().provider === "postgresql";
}

export function resetPostgresDataPlaneForTests() {
  resetDataPlaneForTests();
}

export type { AppDatabase };
