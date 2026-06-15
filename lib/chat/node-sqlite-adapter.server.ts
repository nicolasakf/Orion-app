import { DatabaseSync } from "node:sqlite";

import type {
  OrionDatabase,
  OrionPragmaOptions,
  OrionRunResult,
  OrionStatement,
} from "@/lib/chat/sqlite-adapter";

/** Returns whether params are a single named-parameter binding object. */
function isNamedBinding(params: unknown[]): params is [Record<string, unknown>] {
  if (params.length !== 1) {
    return false;
  }

  const [value] = params;
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Binds and runs a node:sqlite statement with positional or named parameters. */
function runStatement(
  statement: ReturnType<DatabaseSync["prepare"]>,
  params: unknown[]
): OrionRunResult {
  const result = isNamedBinding(params)
    ? statement.run(params[0])
    : statement.run(...(params as Parameters<typeof statement.run>));

  return {
    changes: Number(result.changes),
    lastInsertRowid:
      typeof result.lastInsertRowid === "bigint"
        ? Number(result.lastInsertRowid)
        : result.lastInsertRowid,
  };
}

/** Binds and reads one row from a node:sqlite statement. */
function getStatement(
  statement: ReturnType<DatabaseSync["prepare"]>,
  params: unknown[]
): unknown {
  return isNamedBinding(params)
    ? statement.get(params[0])
    : statement.get(...(params as Parameters<typeof statement.get>));
}

/** Binds and reads all rows from a node:sqlite statement. */
function allStatement(
  statement: ReturnType<DatabaseSync["prepare"]>,
  params: unknown[]
): unknown[] {
  return isNamedBinding(params)
    ? statement.all(params[0])
    : statement.all(...(params as Parameters<typeof statement.all>));
}

/** Wraps a node:sqlite StatementSync with Orion's statement interface. */
function wrapStatement(statement: ReturnType<DatabaseSync["prepare"]>): OrionStatement {
  return {
    run: (...params: unknown[]) => runStatement(statement, params),
    get: (...params: unknown[]) => getStatement(statement, params),
    all: (...params: unknown[]) => allStatement(statement, params),
  };
}

/** Opens a persistent SQLite database backed by Node's built-in node:sqlite module. */
export function createNodeSqliteDatabase(path: string): OrionDatabase {
  const db = new DatabaseSync(path, { allowBareNamedParameters: true });

  return {
    exec(sql: string): void {
      db.exec(sql);
    },

    prepare(sql: string): OrionStatement {
      return wrapStatement(db.prepare(sql));
    },

    transaction<T extends (...args: never[]) => unknown>(
      fn: T
    ): (...args: Parameters<T>) => ReturnType<T> {
      return (...args: Parameters<T>) => {
        db.exec("BEGIN");
        try {
          const result = fn(...args) as ReturnType<T>;
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      };
    },

    pragma(source: string, options?: OrionPragmaOptions): unknown {
      if (source.includes("=")) {
        db.exec(`PRAGMA ${source}`);
        return undefined;
      }

      const row = db.prepare(`PRAGMA ${source}`).get() as Record<string, unknown> | undefined;
      if (options?.simple && row) {
        return Object.values(row)[0];
      }

      return row;
    },

    close(): void {
      db.close();
    },
  };
}

/** Returns whether Node's built-in node:sqlite module is available in this runtime. */
export function isNodeSqliteModuleAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:sqlite");
    return true;
  } catch {
    return false;
  }
}
