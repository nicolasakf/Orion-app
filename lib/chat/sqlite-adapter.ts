/** Result shape returned by OrionStatement.run(), matching better-sqlite3. */
export interface OrionRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/** Options for reading a single-value PRAGMA, matching better-sqlite3. */
export interface OrionPragmaOptions {
  simple?: boolean;
}

/** Prepared statement surface used by Orion chat storage. */
export interface OrionStatement {
  run(...params: unknown[]): OrionRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/** Database surface used by Orion chat storage. */
export interface OrionDatabase {
  exec(sql: string): void;
  prepare(sql: string): OrionStatement;
  transaction<T extends (...args: never[]) => unknown>(fn: T): (...args: Parameters<T>) => ReturnType<T>;
  pragma(source: string, options?: OrionPragmaOptions): unknown;
  close(): void;
}
