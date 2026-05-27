import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookAppView } from "@/components/notebook/notebook-app-view";
import { CellType, type NotebookType } from "@/lib/types";

vi.mock("@/components/notebook/notebook-app-schema-view", () => ({
  NotebookAppSchemaView: () => <div data-testid="schema-view" />,
}));

afterEach(() => {
  cleanup();
});

function makeNotebook(metadata: NotebookType["metadata"] = {}): NotebookType {
  return {
    cells: [
      {
        cell_type: CellType.MARKDOWN,
        source: ["# Intro"],
        metadata: { orion: { id: "intro", app: { enabled: true } } },
      },
    ],
    metadata,
    nbformat: 4,
    nbformat_minor: 5,
  };
}

describe("NotebookAppView", () => {
  it("renders the declarative schema when present", () => {
    render(
      <NotebookAppView
        notebook={makeNotebook({
          orion: {
            appView: {
              schema: {
                version: 1,
                primitiveRegistry: { source: "builtin" },
                root: {
                  type: "Page",
                  props: {},
                  children: [],
                },
              },
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("schema-view")).toBeInTheDocument();
  });

  it("shows the empty state when no schema exists", () => {
    render(<NotebookAppView notebook={makeNotebook()} />);

    expect(screen.getByText("No cells in App View")).toBeInTheDocument();
  });

  it("ignores legacy-only App View metadata", () => {
    render(
      <NotebookAppView
        notebook={makeNotebook({
          orion: {
            appView: {
              grid: { cols: 8 },
              layout: { intro: { x: 0, y: 0, w: 2, h: 2 } },
            },
          },
        })}
      />,
    );

    expect(screen.getByText("No cells in App View")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-view")).not.toBeInTheDocument();
  });

  it("shows an error panel when the schema is invalid", () => {
    render(
      <NotebookAppView
        notebook={makeNotebook({
          orion: {
            appView: {
              schema: {
                version: 1,
                primitiveRegistry: { source: "builtin" },
                root: { type: "Hero", props: {} },
              },
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText("App View schema could not be rendered"),
    ).toBeInTheDocument();
    expect(screen.getByText(/unknown primitive 'Hero'/)).toBeInTheDocument();
  });
});
