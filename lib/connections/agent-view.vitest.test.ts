import { describe, expect, it } from "vitest";

import {
  renderConnectionList,
  renderConnectionRequest,
} from "@/lib/connections/agent-view";
import type { ConnectionSummary } from "@/lib/connections/types";

function summary(overrides: Partial<ConnectionSummary> = {}): ConnectionSummary {
  return {
    id: "google-sheets",
    toolId: "google-sheets",
    label: "Acme finance sheet",
    kind: "service_account",
    secretKeys: ["serviceAccountJson"],
    config: { spreadsheetId: "1AbC" },
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("renderConnectionList", () => {
  it("states plainly that nothing is reachable when the store is empty", () => {
    const output = renderConnectionList([]);

    expect(output).toContain("No connections are configured.");
    expect(output).toContain("cannot currently reach any external system");
  });

  it("forbids inventing a settings screen when nothing is connected", () => {
    // The reported failure: with no route available the agent invented a
    // "Data Sources / Integrations" panel rather than saying it had nothing.
    const output = renderConnectionList([]);

    expect(output).toContain("do not name a settings");
    expect(output).toContain("screen, panel, or button that is not listed here");
  });

  it("offers only the routes that exist when nothing is connected", () => {
    const output = renderConnectionList([]);

    expect(output).toContain('action "request"');
    expect(output).toContain("file the user exports");
    expect(output).toContain("ask the user to run the step themselves");
  });

  it("lists ids, tools, and non-secret settings", () => {
    const output = renderConnectionList([summary()]);

    expect(output).toContain("1 connection configured.");
    expect(output).toContain("id: google-sheets");
    expect(output).toContain("tool: google-sheets");
    expect(output).toContain("spreadsheetId=1AbC");
  });

  it("names stored secrets without revealing them", () => {
    const output = renderConnectionList([summary()]);

    expect(output).toContain("stored secrets (names only): serviceAccountJson");
    expect(output).toContain("Secret values are not available through this tool");
  });

  it("points the agent at the broker for reading a connection", () => {
    const output = renderConnectionList([summary()]);

    expect(output).toContain("from orion_ui import connections");
    expect(output).toContain('connections.get("<id>")');
  });

  it("flags an unverified connection so the agent verifies before real work", () => {
    expect(renderConnectionList([summary()])).toContain(
      "last verified: never — verify with the smallest possible read first",
    );
  });

  it("surfaces an expired OAuth token", () => {
    const output = renderConnectionList([
      summary({ kind: "oauth2", expired: true, secretKeys: ["accessToken"] }),
    ]);

    expect(output).toContain("EXPIRED");
  });

  it("pluralizes the count correctly", () => {
    const output = renderConnectionList([
      summary({ id: "one" }),
      summary({ id: "two" }),
    ]);

    expect(output).toContain("2 connections configured.");
  });
});

describe("renderConnectionRequest", () => {
  it("tells the agent the settings tab is already open", () => {
    const output = renderConnectionRequest("google-sheets", "to read the sales sheet");

    expect(output).toContain("opened the Connections settings for google-sheets");
    expect(output).toContain("to read the sales sheet");
  });

  it("stops the agent from inventing an alternative path or retrying", () => {
    const output = renderConnectionRequest("slack");

    expect(output).toContain("do not guess at a");
    expect(output).toContain("different navigation path");
    expect(output).toContain("do not retry this tool in a loop");
  });

  it("falls back to a neutral phrase when no tool was named", () => {
    expect(renderConnectionRequest(undefined)).toContain("for a new system");
    expect(renderConnectionRequest("   ")).toContain("for a new system");
  });

  it("omits the reason line when none was given", () => {
    expect(renderConnectionRequest("slack")).not.toContain("Stated reason");
  });
});
