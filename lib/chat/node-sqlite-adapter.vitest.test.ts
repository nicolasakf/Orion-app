// @vitest-environment node

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";

import { createNodeSqliteDatabase } from "@/lib/chat/node-sqlite-adapter.server";

describe("node:sqlite adapter", () => {
  let tempDirectory: string;

  afterEach(() => {
    if (tempDirectory) {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("supports exec, named parameters, and scalar pragma reads", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "orion-node-sqlite-"));
    const dbPath = join(tempDirectory, "test.db");
    const db = createNodeSqliteDatabase(dbPath);

    db.exec("create table items (id integer primary key, name text not null)");
    db.prepare("insert into items (id, name) values (@id, @name)").run({
      id: 1,
      name: "alpha",
    });

    const row = db.prepare("select name from items where id = ?").get(1) as {
      name: string;
    };
    expect(row.name).toBe("alpha");

    db.exec("pragma user_version = 3");
    expect(db.pragma("user_version", { simple: true })).toBe(3);

    db.close();
  });

  it("commits and rolls back transaction helpers", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "orion-node-sqlite-tx-"));
    const dbPath = join(tempDirectory, "test.db");
    const db = createNodeSqliteDatabase(dbPath);

    db.exec("create table counters (value integer not null)");
    db.prepare("insert into counters (value) values (1)").run();

    const increment = db.transaction(() => {
      db.prepare("update counters set value = value + 1").run();
    });
    increment();
    expect(
      (db.prepare("select value from counters").get() as { value: number }).value
    ).toBe(2);

    const fail = db.transaction(() => {
      db.prepare("update counters set value = value + 5").run();
      throw new Error("rollback");
    });
    expect(() => fail()).toThrow("rollback");
    expect(
      (db.prepare("select value from counters").get() as { value: number }).value
    ).toBe(2);

    db.close();
  });
});
