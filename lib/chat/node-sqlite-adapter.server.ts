import type {
  OrionDatabase,
  OrionPragmaOptions,
  OrionRunResult,
  OrionStatement,
} from "@/lib/chat/sqlite-adapter";

type NodeSqliteDatabaseSync = import("node:sqlite").DatabaseSync;
type NodeSqliteStatement = ReturnType<NodeSqliteDatabaseSync["prepare"]>;

/** Named bind values accepted by node:sqlite (mirrors SQLInputValue). */
type SqlNamedParams = Record<string, null | number | bigint | string | NodeJS.ArrayBufferView>;

/** Loads DatabaseSync lazily so Node versions without node:sqlite can import this module. */
function getDatabaseSyncClass(): typeof import("node:sqlite").DatabaseSync {
  const getBuiltinModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (specifier: string) => unknown;
    }
  ).getBuiltinModule;
  if (!getBuiltinModule) {
    throw new Error("This Node.js runtime does not expose node:sqlite.");
  }
  const nodeSqlite = getBuiltinModule("node:sqlite") as
    | typeof import("node:sqlite")
    | undefined;
  if (!nodeSqlite?.DatabaseSync) {
    throw new Error("This Node.js runtime does not provide node:sqlite DatabaseSync.");
  }
  return nodeSqlite.DatabaseSync;
}

/** Returns whether params are a single named-parameter binding object. */
function isNamedBinding(params: unknown[]): params is [SqlNamedParams] {
  if (params.length !== 1) {
    return false;
  }

  const [value] = params;
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Binds and runs a node:sqlite statement with positional or named parameters. */
function runStatement(statement: NodeSqliteStatement, params: unknown[]): OrionRunResult {
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
function getStatement(statement: NodeSqliteStatement, params: unknown[]): unknown {
  return isNamedBinding(params)
    ? statement.get(params[0])
    : statement.get(...(params as Parameters<typeof statement.get>));
}

/** Binds and reads all rows from a node:sqlite statement. */
function allStatement(statement: NodeSqliteStatement, params: unknown[]): unknown[] {
  return isNamedBinding(params)
    ? statement.all(params[0])
    : statement.all(...(params as Parameters<typeof statement.all>));
}

/** Wraps a node:sqlite StatementSync with Orion's statement interface. */
function wrapStatement(statement: NodeSqliteStatement): OrionStatement {
  return {
    run: (...params: unknown[]) => runStatement(statement, params),
    get: (...params: unknown[]) => getStatement(statement, params),
    all: (...params: unknown[]) => allStatement(statement, params),
  };
}

/** Opens a persistent SQLite database backed by Node's built-in node:sqlite module. */
export function createNodeSqliteDatabase(path: string): OrionDatabase {
  const DatabaseSync = getDatabaseSyncClass();
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
    getDatabaseSyncClass();
    return true;
  } catch {
    return false;
  }
}
