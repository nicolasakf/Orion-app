import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrionUiOutputRenderer } from "@/components/notebook/renderers/orion-ui";
import type { OrionUiStateChangeContext } from "@/components/notebook/orion-ui-primitives";
import type {
  OrionTableCommResponse,
  OrionTableOutputMetadata,
  OrionTableRequest,
} from "@/components/notebook/orion-ui-table/types";
import { ORION_UI_MIME_TYPE } from "@/lib/notebook/app-view";
import { OutputType, type NotebookOutputType } from "@/lib/types";

const useExperienceModeMock = vi.hoisted(() =>
  vi.fn<() => "pro" | "business">(() => "pro"),
);
const clipboardWriteTextMock = vi.hoisted(() =>
  vi.fn<(text: string) => Promise<void>>(),
);

vi.mock("@/hooks/use-orion-settings", () => ({
  useExperienceMode: useExperienceModeMock,
}));

beforeEach(() => {
  clipboardWriteTextMock.mockReset();
  clipboardWriteTextMock.mockResolvedValue();
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("navigator", {
    clipboard: { writeText: clipboardWriteTextMock },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useExperienceModeMock.mockReturnValue("pro");
});

function renderOrionUiOutput({
  value,
  onStateChange = vi.fn(),
  onAction = vi.fn(),
  onUnmount = vi.fn(),
  onTableRequest = vi.fn(),
  onTableMetadataChange = vi.fn(),
  outputMetadata = {},
}: {
  value: unknown;
  onStateChange?: (
    key: string,
    value: string | number | boolean,
    outputId?: string,
    change?: OrionUiStateChangeContext,
  ) => void;
  onAction?: (action: unknown) => void;
  onUnmount?: (outputId?: string) => void;
  onTableRequest?: (
    request: OrionTableRequest,
  ) => Promise<OrionTableCommResponse>;
  onTableMetadataChange?: (
    cellIndex: number,
    outputIndex: number,
    metadata: OrionTableOutputMetadata,
  ) => void;
  outputMetadata?: NotebookOutputType["metadata"];
}) {
  const output: NotebookOutputType = {
    output_type: OutputType.DISPLAY_DATA,
    data: { [ORION_UI_MIME_TYPE]: value },
    metadata: outputMetadata,
  };

  const rendered = render(
    <OrionUiOutputRenderer
      output={output}
      mimeType={ORION_UI_MIME_TYPE}
      value={value}
      theme="light"
      trusted
      ansiConverter={{} as never}
      sanitize={(html) => html}
      actions={{
        cellIndex: 0,
        outputIndex: 0,
        onOrionUiStateChange: onStateChange,
        onOrionUiAction: onAction,
        onOrionUiUnmount: onUnmount,
        onOrionUiTableRequest: onTableRequest,
        onOrionUiTableMetadataChange: onTableMetadataChange,
      }}
    />,
  );

  return {
    ...rendered,
    onStateChange,
    onAction,
    onUnmount,
    onTableRequest,
    onTableMetadataChange,
  };
}

function tablePayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    id: "ui-table",
    root: {
      type: "Table",
      props: {
        tableId: "table-1",
        source: "df",
        title: "Scores",
        mode: "paginated",
        pageSize: 2,
        initialWindow: {
          tableId: "table-1",
          columns: [
            { key: "__index__", label: "Index", dtype: "index", isIndex: true },
            {
              key: "name",
              label: "name",
              dtype: "object",
              filterKind: "text",
              filterOperations: [
                "contains",
                "doesNotContain",
                "startsWith",
                "endsWith",
                "equals",
                "notEquals",
                "regex",
                "blank",
                "notBlank",
              ],
            },
            {
              key: "score",
              label: "score",
              dtype: "int64",
              filterKind: "number",
              numericType: "integer",
              filterOperations: [
                "equals",
                "notEquals",
                "greaterThan",
                "greaterThanOrEqual",
                "lessThan",
                "lessThanOrEqual",
                "between",
                "blank",
                "notBlank",
              ],
            },
          ],
          rows: [
            { __rowNumber: 0, __index__: 0, name: "Alice", score: 95 },
            { __rowNumber: 1, __index__: 1, name: "Bob", score: 87 },
          ],
          offset: 0,
          limit: 2,
          totalRows: 4,
          sourceRows: 4,
          totalColumns: 2,
          groupBy: null,
          groupCounts: {},
          expression: "df",
        },
        ...overrides,
      },
      children: [],
    },
    state: {},
    bindings: {},
  };
}

function savedTableView(overrides: Partial<OrionTableOutputMetadata["views"][number]> = {}) {
  return {
    id: "view-1",
    name: "A",
    operations: {
      search: "",
      sort: null,
      filters: [],
      groupBy: null,
    },
    expression: "df",
    display: {
      mode: "paginated" as const,
      pageSize: 2,
      visibleColumns: ["__index__", "name", "score"],
      columnWidths: {},
      freezeHeader: true,
      fontSize: 13,
      rowHeight: 36,
    },
    ...overrides,
  };
}

describe("OrionUiOutputRenderer", () => {
  it("shows active default filter and sort controls in blue", () => {
    const { container } = renderOrionUiOutput({
      value: tablePayload({
        defaultState: {
          search: "",
          sort: { column: "score", direction: "desc" },
          filters: [{ column: "name", operation: "contains", value: "a" }],
          groupBy: null,
        },
      }),
    });

    expect(screen.getByRole("button", { name: "Sort score" })).toHaveClass(
      "text-blue-600",
    );
    expect(screen.getByRole("button", { name: "Sort score" })).not.toHaveClass(
      "opacity-0",
    );
    expect(screen.getByRole("button", { name: "Filter score" })).not.toHaveClass(
      "opacity-0",
    );
    expect(screen.getByRole("button", { name: "score" })).toHaveClass("pr-14");
    expect(screen.getByRole("button", { name: "Filter name" })).toHaveClass(
      "text-blue-600",
    );
    expect(screen.getByRole("button", { name: "Filter name" })).not.toHaveClass(
      "opacity-0",
    );
    expect(screen.getByRole("button", { name: "Sort name" })).not.toHaveClass(
      "opacity-0",
    );
    expect(screen.getByRole("button", { name: "name" })).toHaveClass("pr-14");
    expect(container.querySelector(".orion-ui-table")).toBeInTheDocument();
  });

  it("renders controls and forwards state changes with the output id", () => {
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-test",
        root: {
          type: "Input",
          props: { label: "Region", stateKey: "region", defaultValue: "west" },
          children: [],
        },
        state: { region: "west" },
        bindings: { region: { kind: "python_state", valueType: "string" } },
      },
    });

    const input = screen.getByLabelText("Region");
    expect(input).toHaveValue("west");
    fireEvent.change(input, { target: { value: "east" } });
    expect(onStateChange).toHaveBeenCalledWith("region", "east", "ui-test");
  });

  it("cancels output-scoped change actions when the renderer unmounts", () => {
    const { onUnmount, unmount } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-unmount",
        root: {
          type: "Input",
          props: { stateKey: "query", defaultValue: "" },
          children: [],
        },
        state: { query: "" },
        bindings: { query: { kind: "python_state", valueType: "string" } },
      },
    });

    unmount();

    expect(onUnmount).toHaveBeenCalledWith("ui-unmount");
  });

  it("forwards text change actions with the smart debounce", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-input-action",
        root: {
          type: "Input",
          props: {
            label: "Query",
            stateKey: "query",
            defaultValue: "",
            onChange: action,
          },
          children: [],
        },
        state: { query: "" },
        bindings: { query: { kind: "python_state", valueType: "string" } },
      },
    });

    expect(onStateChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "revenue" },
    });

    expect(onStateChange).toHaveBeenLastCalledWith(
      "query",
      "revenue",
      "ui-input-action",
      { action, debounceMs: 500, execute: true },
    );
  });

  it("uses immediate discrete actions and honors debounce overrides", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-checkbox-action",
        root: {
          type: "Checkbox",
          props: {
            label: "Include archived",
            stateKey: "archived",
            defaultValue: false,
            onChange: action,
            debounceMs: 75,
          },
          children: [],
        },
        state: { archived: false },
        bindings: {
          archived: { kind: "python_state", valueType: "boolean" },
        },
      },
    });

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onStateChange).toHaveBeenLastCalledWith(
      "archived",
      true,
      "ui-checkbox-action",
      { action, debounceMs: 75, execute: true },
    );
  });

  it("runs slider keyboard nudges immediately", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-slider-action",
        root: {
          type: "Slider",
          props: {
            label: "Threshold",
            stateKey: "threshold",
            defaultValue: 10,
            min: 0,
            max: 100,
            step: 1,
            onChange: action,
          },
          children: [],
        },
        state: { threshold: 10 },
        bindings: {
          threshold: { kind: "python_state", valueType: "number" },
        },
      },
    });

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

    expect(onStateChange).toHaveBeenCalledWith(
      "threshold",
      11,
      "ui-slider-action",
      { action, debounceMs: 0, execute: true },
    );
  });

  it("syncs incomplete calendar ranges without executing their action", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-range-action",
        root: {
          type: "Calendar",
          props: {
            label: "Window",
            stateKey: "window",
            mode: "range",
            defaultValue: "",
            presets: [
              { label: "Start only", from: "2026-07-01" },
              {
                label: "Full range",
                from: "2026-07-01",
                to: "2026-07-07",
              },
            ],
            onChange: action,
          },
          children: [],
        },
        state: { window: "" },
        bindings: { window: { kind: "python_state", valueType: "string" } },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Start only" }));
    expect(onStateChange).toHaveBeenLastCalledWith(
      "window",
      JSON.stringify({ from: "2026-07-01" }),
      "ui-range-action",
      { action, debounceMs: 0, execute: false },
    );

    fireEvent.click(screen.getByRole("button", { name: "Full range" }));
    expect(onStateChange).toHaveBeenLastCalledWith(
      "window",
      JSON.stringify({ from: "2026-07-01", to: "2026-07-07" }),
      "ui-range-action",
      { action, debounceMs: 0, execute: true },
    );
  });

  it("applies one date-time picker action to its time state keys", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-date-time-action",
        root: {
          type: "DateTimePicker",
          props: {
            label: "Schedule",
            stateKey: "date",
            defaultValue: "2026-07-21",
            startTimeKey: "start_time",
            startTimeDefaultValue: "09:00:00",
            endTimeKey: "end_time",
            endTimeDefaultValue: "17:00:00",
            presets: [{ label: "Tomorrow", value: "2026-07-22" }],
            onChange: action,
          },
          children: [],
        },
        state: {
          date: "2026-07-21",
          start_time: "09:00:00",
          end_time: "17:00:00",
        },
        bindings: {
          date: { kind: "python_state", valueType: "string" },
          start_time: { kind: "python_state", valueType: "string" },
          end_time: { kind: "python_state", valueType: "string" },
        },
      },
    });

    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "10:30:00" },
    });
    expect(onStateChange).toHaveBeenLastCalledWith(
      "start_time",
      "10:30:00",
      "ui-date-time-action",
      { action, debounceMs: 500, execute: true },
    );

    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "18:15:00" },
    });
    expect(onStateChange).toHaveBeenLastCalledWith(
      "end_time",
      "18:15:00",
      "ui-date-time-action",
      { action, debounceMs: 500, execute: true },
    );

    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(onStateChange).toHaveBeenLastCalledWith(
      "date",
      "2026-07-22",
      "ui-date-time-action",
      { action, debounceMs: 0, execute: true },
    );
  });

  it("dispatches declarative button actions", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onAction } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-action",
        root: {
          type: "Button",
          props: { label: "Run", action },
          children: [],
        },
        state: {},
        bindings: {},
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onAction).toHaveBeenCalledWith(action);
  });

  it("renders destructive button variant", () => {
    renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-destructive-button",
        root: {
          type: "Button",
          props: { label: "Delete", variant: "destructive" },
          children: [],
        },
        state: {},
        bindings: {},
      },
    });

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "bg-destructive",
    );
  });

  it("renders primitive class hooks without requiring App View CSS", () => {
    renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-class",
        root: {
          type: "Button",
          props: { label: "Styled", className: "metric-action" },
          children: [],
        },
        state: {},
        bindings: {},
      },
    });

    expect(screen.getByRole("button", { name: "Styled" })).toHaveClass(
      "metric-action",
    );
  });

  it("uses the continuous debounce while dragging a date range", () => {
    const action = { type: "execute_cells", cellIds: ["cell-a"] };
    const { onStateChange } = renderOrionUiOutput({
      value: {
        version: 1,
        id: "ui-date-range-drag",
        root: {
          type: "DateRangeSlider",
          props: {
            label: "Analysis window",
            stateKey: "analysis_window",
            defaultValue: '{"from":"2026-05-01","to":"2026-05-07"}',
            onChange: action,
          },
          children: [],
        },
        state: {
          analysis_window: '{"from":"2026-05-01","to":"2026-05-07"}',
        },
        bindings: {
          analysis_window: { kind: "python_state", valueType: "string" },
        },
      },
    });
    const rangeHandle = screen.getByRole("button", {
      name: /Move selected range/,
    });
    const track = rangeHandle.parentElement;
    expect(track).not.toBeNull();
    Object.defineProperty(rangeHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(track!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
      top: 0,
      right: 200,
      bottom: 48,
      height: 48,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(rangeHandle, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(track!, { pointerId: 1, clientX: 120 });

    expect(onStateChange).toHaveBeenCalledWith(
      "analysis_window",
      expect.any(String),
      "ui-date-range-drag",
      { action, debounceMs: 250, execute: true },
    );
  });

  it("renders date range slider presets and forwards range changes", () => {
    const onStateChange = vi.fn();
    renderOrionUiOutput({
      onStateChange,
      value: {
        version: 1,
        id: "ui-date-range",
        root: {
          type: "DateRangeSlider",
          props: {
            label: "Analysis window",
            stateKey: "analysis_window",
            defaultValue: '{"from":"2026-05-01","to":"2026-05-07"}',
          },
          children: [],
        },
        state: {
          analysis_window: '{"from":"2026-05-01","to":"2026-05-07"}',
        },
        bindings: {
          analysis_window: { kind: "python_state", valueType: "string" },
        },
      },
    });

    expect(
      screen.getByRole("group", { name: "Analysis window" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "This month" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 7D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
    expect(screen.getByText("7 Days")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "30D" }));

    expect(onStateChange).toHaveBeenCalled();
    const [key, rawValue, outputId] = onStateChange.mock.calls.at(-1) ?? [];
    expect(key).toBe("analysis_window");
    expect(outputId).toBe("ui-date-range");
    const nextRange = JSON.parse(String(rawValue)) as {
      from: string;
      to: string;
    };
    const from = new Date(`${nextRange.from}T00:00:00`);
    const to = new Date(`${nextRange.to}T00:00:00`);
    const dayCount =
      Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    expect(dayCount).toBe(30);
  });

  it("renders a Table primitive from a bounded initial window", () => {
    renderOrionUiOutput({ value: tablePayload() });

    expect(screen.queryByText("Scores")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("of 2")).toBeInTheDocument();
    expect(screen.getByText("Alice").closest("td")).toHaveClass(
      "after:left-3",
      "after:right-3",
      "after:bg-border/60",
    );
  });

  it("shows only text operations for a text column", () => {
    renderOrionUiOutput({ value: tablePayload() });

    fireEvent.click(screen.getByRole("button", { name: "Filter name" }));
    const operationSelect = screen.getByLabelText("Filter operation for name");
    expect(operationSelect).toHaveTextContent("Contains");

    fireEvent.click(operationSelect);

    expect(screen.getByRole("option", { name: "Starts with" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Less than" }),
    ).not.toBeInTheDocument();
  });

  it("serializes numeric between filters with typed range controls", async () => {
    const value = tablePayload();
    const onTableRequest = vi.fn(async () =>
      value.root.props.initialWindow as OrionTableCommResponse
    );
    renderOrionUiOutput({ value, onTableRequest });

    fireEvent.click(screen.getByRole("button", { name: "Filter score" }));
    fireEvent.click(screen.getByLabelText("Filter operation for score"));
    fireEvent.click(screen.getByRole("option", { name: "Between" }));
    const lower = screen.getByLabelText("Lower value for score");
    const upper = screen.getByLabelText("Upper value for score");

    expect(lower).toHaveAttribute("type", "number");
    expect(upper).toHaveAttribute("type", "number");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    fireEvent.change(lower, { target: { value: "80" } });
    fireEvent.change(upper, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            filters: [
              {
                column: "score",
                operation: "between",
                value: { lower: "80", upper: "100" },
              },
            ],
          }),
        }),
      ),
    );
  });

  it("uses date controls and context-aware operation labels", () => {
    const value = tablePayload();
    const initialWindow = value.root.props.initialWindow;
    value.root.props.initialWindow = {
      ...initialWindow,
      columns: [
        ...initialWindow.columns,
        {
          key: "created_on",
          label: "created_on",
          dtype: "object",
          filterKind: "date",
          filterOperations: [
            "equals",
            "notEquals",
            "greaterThan",
            "greaterThanOrEqual",
            "lessThan",
            "lessThanOrEqual",
            "between",
            "blank",
            "notBlank",
          ],
        },
      ],
      rows: initialWindow.rows.map((row, index) => ({
        ...row,
        created_on: `2026-01-0${index + 1}`,
      })),
      totalColumns: 3,
    };

    renderOrionUiOutput({ value });
    fireEvent.click(screen.getByRole("button", { name: "Filter created_on" }));

    expect(screen.getByLabelText("Filter operation for created_on")).toHaveTextContent(
      "On",
    );
    expect(screen.getByLabelText("Value for created_on")).toHaveAttribute(
      "type",
      "date",
    );
  });

  it("retains an unsupported legacy filter until it is replaced or cleared", () => {
    renderOrionUiOutput({
      value: tablePayload({
        defaultState: {
          search: "",
          sort: null,
          filters: [{ column: "name", operation: "lessThan", value: "z" }],
          groupBy: null,
        },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Filter name" }));

    expect(screen.getByText(/saved filter is unsupported/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
  });

  it("serializes bounded categorical multi-select filters", async () => {
    const value = tablePayload();
    const initialWindow = value.root.props.initialWindow;
    value.root.props.initialWindow = {
      ...initialWindow,
      columns: initialWindow.columns.map((column) =>
        column.key === "name"
          ? {
              ...column,
              dtype: "category",
              filterKind: "categorical",
              filterOptions: ["Alice", "Bob"],
              ordered: false,
              filterOperations: [
                "equals",
                "notEquals",
                "in",
                "notIn",
                "blank",
                "notBlank",
              ],
            }
          : column,
      ) as unknown as typeof initialWindow.columns,
    };
    const onTableRequest = vi.fn(async () =>
      value.root.props.initialWindow as OrionTableCommResponse
    );
    renderOrionUiOutput({ value, onTableRequest });

    fireEvent.click(screen.getByRole("button", { name: "Filter name" }));
    fireEvent.click(screen.getByLabelText("Filter operation for name"));
    fireEvent.click(screen.getByRole("option", { name: "Is any of" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            filters: [
              {
                column: "name",
                operation: "in",
                value: ["Alice"],
              },
            ],
          }),
        }),
      ),
    );
  });

  it("limits comparison shortcuts to ordered columns and requests raw cell values", async () => {
    const value = tablePayload();
    const onTableRequest = vi.fn(
      async (request: OrionTableRequest): Promise<OrionTableCommResponse> => {
        if (request.action === "filter_value") return { value: "95" };
        return value.root.props.initialWindow as OrionTableCommResponse;
      },
    );
    const { container } = renderOrionUiOutput({ value, onTableRequest });
    const table = container.querySelector(".orion-ui-table");

    fireEvent.mouseDown(screen.getByText("Alice"));
    fireEvent.keyDown(table!, { key: ">" });
    expect(onTableRequest).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByText("95"));
    fireEvent.keyDown(table!, { key: ">" });

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "filter_value",
          column: "score",
          rowNumber: 0,
        }),
      ),
    );
    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            filters: [
              {
                column: "score",
                operation: "greaterThanOrEqual",
                value: "95",
              },
            ],
          }),
        }),
      ),
    );
  });

  it("renders each table header as a muted control with overlay actions", () => {
    renderOrionUiOutput({ value: tablePayload() });

    const sortButton = screen.getByRole("button", { name: "Sort score" });
    expect(sortButton).toHaveClass(
      "opacity-0",
      "group-hover/header:opacity-100",
    );
    expect(screen.getByRole("button", { name: "score" })).toHaveClass(
      "group-hover/header:pr-14",
    );
    expect(screen.getByRole("button", { name: "score" })).not.toHaveClass(
      "pr-7",
      "pr-14",
    );
    expect(sortButton.parentElement).toHaveClass(
      "absolute",
      "right-2",
    );
    expect(sortButton.parentElement?.parentElement).toHaveClass(
      "group/header",
      "rounded-lg",
      "bg-muted",
    );
    expect(screen.getByTestId("orion-table-viewport")).toHaveClass("border-b");
    expect(
      screen.getByTestId("orion-table-viewport").querySelector("thead"),
    ).toHaveClass("bg-transparent", "top-0");
  });

  it("portals toolbar tooltips above notebook cell chrome", async () => {
    const { container } = renderOrionUiOutput({ value: tablePayload() });

    fireEvent.pointerMove(screen.getByRole("button", { name: "Fullscreen" }));

    const tooltipLabel = await screen.findByRole("tooltip", {
      name: "Fullscreen",
    });
    const tooltip = tooltipLabel.parentElement;
    expect(tooltip).toHaveClass("z-[100]");
    expect(tooltip).not.toBeNull();
    expect(container.contains(tooltip)).toBe(false);
  });

  it("shows tool-result style gradients at overflowing table edges", async () => {
    renderOrionUiOutput({ value: tablePayload() });

    const viewport = screen.getByTestId("orion-table-viewport");
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 500 },
      scrollWidth: { configurable: true, value: 500 },
    });

    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(
        viewport.parentElement?.querySelector(".bg-gradient-to-t"),
      ).toBeInTheDocument();
      expect(
        viewport.parentElement?.querySelector(".bg-gradient-to-l"),
      ).toBeInTheDocument();
    });
    expect(viewport.querySelector(".bg-gradient-to-t")).not.toBeInTheDocument();
    expect(
      viewport.parentElement?.querySelector(".bg-gradient-to-b"),
    ).not.toBeInTheDocument();
  });

  it("keeps display settings when opening a table fullscreen", () => {
    renderOrionUiOutput({ value: tablePayload() });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settingsInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(settingsInputs[1]!, { target: { value: "60" } });
    fireEvent.change(settingsInputs[2]!, { target: { value: "18" } });

    const viewport = screen.getByTestId("orion-table-viewport");
    expect(viewport.style.fontSize).toBe("18px");
    expect(viewport.querySelector("td")?.style.height).toBe("60px");

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    const fullscreenViewport = screen.getByTestId(
      "orion-table-fullscreen-viewport",
    );
    expect(fullscreenViewport.style.fontSize).toBe("18px");
    expect(fullscreenViewport.querySelector("td")?.style.height).toBe("60px");
  });

  it("keeps table controls and their overlays available fullscreen", () => {
    renderOrionUiOutput({ value: tablePayload() });

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    const dialog = screen.getByRole("dialog", { name: "Scores" });
    expect(
      within(dialog).getByPlaceholderText("Search all columns..."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Save current view" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Exit fullscreen" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("4 rows, 2 columns")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Settings" }));
    expect(within(dialog).getByText("Mode")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Exit fullscreen" }),
    );
    expect(screen.queryByRole("dialog", { name: "Scores" })).not.toBeInTheDocument();
  });

  it("opens and applies column filters inside the fullscreen dialog", async () => {
    const value = tablePayload();
    const onTableRequest = vi.fn(
      async () => value.root.props.initialWindow as OrionTableCommResponse,
    );
    renderOrionUiOutput({ value, onTableRequest });

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    const dialog = screen.getByRole("dialog", { name: "Scores" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Filter name" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Value for name"), {
      target: { value: "Ali" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            filters: [{ column: "name", operation: "contains", value: "Ali" }],
          }),
        }),
      ),
    );
  });

  it("shows table column descriptions when their header is hovered", async () => {
    const value = tablePayload();
    const initialWindow = value.root.props.initialWindow;
    value.root.props.initialWindow = {
      ...initialWindow,
      columns: initialWindow.columns.map((column) =>
        column.key === "score"
          ? { ...column, description: "Final score from the scoring model." }
          : column,
      ),
    };

    renderOrionUiOutput({ value });

    expect(
      screen.queryByRole("button", { name: "About score" }),
    ).not.toBeInTheDocument();

    const headerCard = screen
      .getByRole("button", { name: "score" })
      .parentElement;
    expect(headerCard).not.toBeNull();
    fireEvent.pointerMove(headerCard!);

    const descriptions = await screen.findAllByText(
      "Final score from the scoring model.",
    );
    expect(descriptions).not.toHaveLength(0);
    expect(descriptions[0]).toHaveClass("z-[100]");
    expect(descriptions[0]?.closest("table")).toBeNull();
  });

  it("renders the paginated table footer status bar", () => {
    renderOrionUiOutput({ value: tablePayload() });

    expect(screen.getByText("4 rows, 2 columns")).toBeInTheDocument();
    expect(screen.getByText("2 / page")).toBeInTheDocument();
    expect(screen.getByText("Page")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("orion-table-selection-summary")).getByText("0"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("summarizes selected cells using the footer operation dropdown", () => {
    renderOrionUiOutput({ value: tablePayload() });

    fireEvent.mouseDown(screen.getByText("95"));
    fireEvent.mouseDown(screen.getByText("87"), { ctrlKey: true });

    const summary = screen.getByTestId("orion-table-selection-summary");
    const operation = within(summary).getByRole("combobox", {
      name: "Selection summary operation",
    });
    expect(within(summary).getByText("2")).toBeInTheDocument();

    fireEvent.click(operation);
    fireEvent.click(screen.getByRole("option", { name: "Sum" }));
    expect(within(summary).getByText("182.00")).toBeInTheDocument();

    fireEvent.click(operation);
    fireEvent.click(screen.getByRole("option", { name: "Mean" }));
    expect(within(summary).getByText("91.00")).toBeInTheDocument();

    fireEvent.click(operation);
    fireEvent.click(screen.getByRole("option", { name: "Median" }));
    expect(within(summary).getByText("91.00")).toBeInTheDocument();
  });

  it("lets paginated table pages grow to show every loaded row", () => {
    renderOrionUiOutput({ value: tablePayload({ pageSize: 5 }) });

    const viewport = screen.getByTestId("orion-table-viewport");
    expect(viewport).toHaveClass("overflow-y-visible");
    expect(viewport.style.maxHeight).toBe("");
  });

  it("keeps virtual table pages in a scroll viewport", () => {
    renderOrionUiOutput({ value: tablePayload({ mode: "virtual", pageSize: 5 }) });

    const viewport = screen.getByTestId("orion-table-viewport");
    expect(viewport).toHaveClass("overflow-auto");
    expect(viewport.style.maxHeight).toBe("280px");
  });

  it("does not fall back to the table source when title is missing", () => {
    renderOrionUiOutput({ value: tablePayload({ title: undefined }) });

    expect(screen.queryByText("Scores")).not.toBeInTheDocument();
    expect(screen.queryByText("df")).not.toBeInTheDocument();
    expect(screen.getByText("4 rows, 2 columns")).toBeInTheDocument();
  });

  it("hides the default table tab until a saved view exists", () => {
    const savedView = savedTableView({
      name: "Top scores",
      operations: {
        search: "",
        sort: { column: "score", direction: "desc" },
        filters: [],
        groupBy: null,
      },
      expression: "df.sort_values('score', ascending=False)",
    });
    const { rerender } = renderOrionUiOutput({ value: tablePayload() });

    expect(screen.queryByRole("tab", { name: "Default" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save current view" })).toBeInTheDocument();

    const value = tablePayload();
    const output: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: { [ORION_UI_MIME_TYPE]: value },
      metadata: {
        [ORION_UI_MIME_TYPE]: { table: { version: 1, views: [savedView] } },
      },
    };
    rerender(
      <OrionUiOutputRenderer
        output={output}
        mimeType={ORION_UI_MIME_TYPE}
        value={value}
        theme="light"
        trusted
        ansiConverter={{} as never}
        sanitize={(html) => html}
        actions={{
          cellIndex: 0,
          outputIndex: 0,
          onOrionUiStateChange: vi.fn(),
          onOrionUiAction: vi.fn(),
          onOrionUiTableRequest: vi.fn(),
          onOrionUiTableMetadataChange: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole("tab", { name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Top scores/ })).toBeInTheDocument();
  });

  it("reads legacy table views from output metadata.orion.table", () => {
    renderOrionUiOutput({
      value: tablePayload(),
      outputMetadata: {
        orion: {
          table: {
            version: 1,
            views: [savedTableView({ name: "Legacy view" })],
          },
        },
      },
    });

    expect(screen.getByRole("tab", { name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Legacy view/ })).toBeInTheDocument();
  });

  it("keeps operations scoped to the active saved table view", async () => {
    const savedView = savedTableView();
    const onTableRequest = vi.fn(async () => ({
      tableId: "table-1",
      columns: [
        { key: "__index__", label: "Index", dtype: "index", isIndex: true },
        { key: "name", label: "name", dtype: "object" },
        { key: "score", label: "score", dtype: "int64" },
      ],
      rows: [
        { __rowNumber: 1, __index__: 1, name: "Bob", score: 87 },
        { __rowNumber: 0, __index__: 0, name: "Alice", score: 95 },
      ],
      offset: 0,
      limit: 2,
      totalRows: 4,
      sourceRows: 4,
      totalColumns: 2,
      groupBy: null,
      groupCounts: {},
      expression: "df.sort_values('name')",
    }));
    const onTableMetadataChange = vi.fn();
    const { container } = renderOrionUiOutput({
      value: tablePayload(),
      onTableRequest,
      onTableMetadataChange,
      outputMetadata: {
        [ORION_UI_MIME_TYPE]: {
          table: { version: 1, activeViewId: "view-1", views: [savedView] },
        },
      },
    });
    const table = container.querySelector(".orion-ui-table");

    fireEvent.mouseDown(screen.getByText("Alice"));
    fireEvent.keyDown(table!, { key: "s" });

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            sort: { column: "name", direction: "asc" },
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(onTableMetadataChange).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          activeViewId: "view-1",
          views: expect.arrayContaining([
            expect.objectContaining({
              id: "view-1",
              operations: expect.objectContaining({
                sort: { column: "name", direction: "asc" },
              }),
            }),
          ]),
        }),
      ),
    );
    expect(screen.getByRole("tab", { name: /A/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("resets the active saved table view in place", async () => {
    const savedView = savedTableView({
      operations: {
        search: "alice",
        sort: { column: "score", direction: "desc" },
        filters: [{ column: "name", operation: "contains", value: "a" }],
        groupBy: "name",
      },
      expression: "df.sort_values('score', ascending=False)",
    });
    const onTableRequest = vi.fn(async () => ({
      tableId: "table-1",
      columns: [
        { key: "__index__", label: "Index", dtype: "index", isIndex: true },
        { key: "name", label: "name", dtype: "object" },
        { key: "score", label: "score", dtype: "int64" },
      ],
      rows: [
        { __rowNumber: 0, __index__: 0, name: "Alice", score: 95 },
        { __rowNumber: 1, __index__: 1, name: "Bob", score: 87 },
      ],
      offset: 0,
      limit: 2,
      totalRows: 4,
      sourceRows: 4,
      totalColumns: 2,
      groupBy: null,
      groupCounts: {},
      expression: "df",
    }));
    const onTableMetadataChange = vi.fn();
    renderOrionUiOutput({
      value: tablePayload(),
      onTableRequest,
      onTableMetadataChange,
      outputMetadata: {
        [ORION_UI_MIME_TYPE]: {
          table: { version: 1, activeViewId: "view-1", views: [savedView] },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset table" }));

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: {
            search: "",
            sort: null,
            filters: [],
            groupBy: null,
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(onTableMetadataChange).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          activeViewId: "view-1",
          views: expect.arrayContaining([
            expect.objectContaining({
              id: "view-1",
              operations: {
                search: "",
                sort: null,
                filters: [],
                groupBy: null,
              },
            }),
          ]),
        }),
      ),
    );
    expect(screen.getByRole("tab", { name: /A/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("delegates table search to the backend request callback", async () => {
    const onTableRequest = vi.fn(async () => ({
      tableId: "table-1",
      columns: [
        { key: "__index__", label: "Index", dtype: "index", isIndex: true },
        { key: "name", label: "name", dtype: "object" },
        { key: "score", label: "score", dtype: "int64" },
      ],
      rows: [{ __rowNumber: 1, __index__: 1, name: "Bob", score: 87 }],
      offset: 0,
      limit: 2,
      totalRows: 1,
      sourceRows: 4,
      totalColumns: 2,
      groupBy: null,
      groupCounts: {},
      expression: 'df.query("name == Bob")',
    }));

    renderOrionUiOutput({ value: tablePayload(), onTableRequest });

    fireEvent.change(screen.getByPlaceholderText("Search all columns..."), {
      target: { value: "bob" },
    });

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          tableId: "table-1",
          state: expect.objectContaining({ search: "bob" }),
        }),
      ),
    );
    expect(await screen.findByText("Bob")).toBeInTheDocument();
  });

  it("supports the table sort keyboard shortcut", async () => {
    const onTableRequest = vi.fn(async () => ({
      tableId: "table-1",
      columns: [
        { key: "__index__", label: "Index", dtype: "index", isIndex: true },
        { key: "name", label: "name", dtype: "object" },
        { key: "score", label: "score", dtype: "int64" },
      ],
      rows: [
        { __rowNumber: 1, __index__: 1, name: "Bob", score: 87 },
        { __rowNumber: 0, __index__: 0, name: "Alice", score: 95 },
      ],
      offset: 0,
      limit: 2,
      totalRows: 4,
      sourceRows: 4,
      totalColumns: 2,
      groupBy: null,
      groupCounts: {},
      expression: "df.sort_values('name')",
    }));
    const { container } = renderOrionUiOutput({ value: tablePayload(), onTableRequest });
    const table = container.querySelector(".orion-ui-table");

    fireEvent.mouseDown(screen.getByText("Alice"));
    fireEvent.keyDown(table!, { key: "s" });

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            sort: { column: "name", direction: "asc" },
          }),
        }),
      ),
    );

    fireEvent.keyDown(table!, { key: "s" });

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: "fetch",
          state: expect.objectContaining({
            sort: { column: "name", direction: "desc" },
          }),
        }),
      ),
    );
  });

  it("focuses the table and contains cursor keys after selecting a cell", () => {
    const { container } = renderOrionUiOutput({ value: tablePayload() });
    const table = container.querySelector<HTMLElement>(".orion-ui-table");
    const notebookShortcut = vi.fn();
    document.addEventListener("keydown", notebookShortcut);

    try {
      const nameCell = screen.getByText("Alice").closest("td");
      const scoreCell = screen.getByText("95").closest("td");
      expect(nameCell).not.toBeNull();
      expect(scoreCell).not.toBeNull();

      fireEvent.mouseDown(nameCell!);

      expect(table).toHaveFocus();
      expect(nameCell).toHaveClass("bg-primary/20");

      fireEvent.keyDown(table!, { key: "ArrowRight" });

      expect(notebookShortcut).not.toHaveBeenCalled();
      expect(nameCell).not.toHaveClass("bg-primary/20");
      expect(scoreCell).toHaveClass("bg-primary/20");

      fireEvent.keyDown(table!, { key: "ArrowLeft" });

      expect(notebookShortcut).not.toHaveBeenCalled();
      expect(nameCell).toHaveClass("bg-primary/20");
      expect(scoreCell).not.toHaveClass("bg-primary/20");
    } finally {
      document.removeEventListener("keydown", notebookShortcut);
    }
  });

  it("copies only selected cell content with Cmd+C", async () => {
    const { container } = renderOrionUiOutput({ value: tablePayload() });
    const table = container.querySelector(".orion-ui-table");

    fireEvent.mouseDown(screen.getByText("Alice"));
    fireEvent.keyDown(table!, { key: "c", metaKey: true });

    await waitFor(() =>
      expect(clipboardWriteTextMock).toHaveBeenCalledWith("Alice"),
    );
  });

  it("copies the entire current view from the toolbar despite a cell selection", async () => {
    const csv = "name,score\nAlice,95\nBob,87";
    const value = tablePayload();
    const onTableRequest = vi.fn(
      async (request: OrionTableRequest): Promise<OrionTableCommResponse> =>
        request.action === "export_csv"
          ? { csv, rowCount: 2, truncated: false }
          : value.root.props.initialWindow as OrionTableCommResponse,
    );
    renderOrionUiOutput({ value, onTableRequest });

    fireEvent.mouseDown(screen.getByText("Alice"));
    fireEvent.click(screen.getByRole("button", { name: "Copy entire table" }));

    await waitFor(() =>
      expect(onTableRequest).toHaveBeenCalledWith(
        expect.objectContaining({ action: "export_csv" }),
      ),
    );
    await waitFor(() =>
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(csv),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy entire table" }).querySelector("svg"),
      ).toHaveClass("animate-in", "zoom-in-50", "text-green-500"),
    );
  });

  it("cycles table column widths and fits a column's contents from its resize handle", () => {
    const longTitle = "Customer account display name";
    const longContent = "The longest customer account name in this loaded table window";
    const value = tablePayload();
    value.root.props.initialWindow.columns[1]!.label = longTitle;
    value.root.props.initialWindow.rows[0]!.name = longContent;
    renderOrionUiOutput({ value });

    const nameCell = screen.getByText(longContent).closest("td");
    expect(nameCell).not.toBeNull();
    expect(nameCell).toHaveStyle({ width: "150px" });

    fireEvent.click(screen.getByRole("button", { name: "Fit columns to titles" }));
    const titleWidth = nameCell!.style.width;
    expect(titleWidth).not.toBe("150px");

    fireEvent.click(screen.getByRole("button", { name: "Fit columns to contents" }));
    const contentWidth = nameCell!.style.width;
    expect(contentWidth).not.toBe(titleWidth);

    fireEvent.click(screen.getByRole("button", { name: "Reset column widths" }));
    expect(nameCell).toHaveStyle({ width: "150px" });

    fireEvent.doubleClick(screen.getByTestId("orion-table-column-resize-name"));
    expect(Number.parseInt(nameCell!.style.width, 10)).toBeGreaterThan(150);
  });

  it("opens URL-valued table cells externally", () => {
    const href = "https://example.com/reports/weekly";
    const value = tablePayload();
    value.root.props.initialWindow.rows[0]!.name = href;
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    try {
      renderOrionUiOutput({ value });

      const link = screen.getByRole("link", { name: href });
      expect(link).toHaveAttribute("href", href);
      fireEvent.click(link);

      expect(openSpy).toHaveBeenCalledWith(
        href,
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      openSpy.mockRestore();
    }
  });

  it("stores saved table views in output metadata", async () => {
    const onTableRequest = vi.fn(async () => ({
      expression: "df.sort_values('score', ascending=False)",
    }));
    const onTableMetadataChange = vi.fn();
    renderOrionUiOutput({
      value: tablePayload(),
      onTableRequest,
      onTableMetadataChange,
      outputMetadata: { [ORION_UI_MIME_TYPE]: { table: { version: 1, views: [] } } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    fireEvent.change(screen.getByPlaceholderText("View name"), {
      target: { value: "Top scores" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onTableMetadataChange).toHaveBeenCalled());
    const [, , metadata] = onTableMetadataChange.mock.calls.at(-1)!;
    expect(metadata.version).toBe(2);
    expect(metadata.views[0]?.name).toBe("Top scores");
    expect(metadata.views[0]?.expression).toBe(
      "df.sort_values('score', ascending=False)",
    );
  });

  it("shows table backend errors without replacing the initial window", async () => {
    const onTableRequest = vi.fn(async () => {
      throw new Error(
        "Orion table is no longer registered in the kernel: orion-table-abc",
      );
    });
    renderOrionUiOutput({ value: tablePayload(), onTableRequest });

    fireEvent.change(screen.getByPlaceholderText("Search all columns..."), {
      target: { value: "alice" },
    });

    expect(
      await screen.findByText(/Run the cell that displays this table/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows simpler table backend errors in business view", async () => {
    useExperienceModeMock.mockReturnValue("business");
    const onTableRequest = vi.fn(async () => {
      throw new Error(
        "Orion table is no longer registered in the kernel: orion-table-abc",
      );
    });
    renderOrionUiOutput({ value: tablePayload(), onTableRequest });

    fireEvent.change(screen.getByPlaceholderText("Search all columns..."), {
      target: { value: "alice" },
    });

    expect(
      await screen.findByText("Refresh this report to sort, filter, or explore this table."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kernel/i)).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("rejects invalid Table primitive payloads", () => {
    renderOrionUiOutput({
      value: tablePayload({ initialWindow: { rows: "not an array" } }),
    });

    expect(screen.getByText("Orion table could not be rendered")).toBeInTheDocument();
  });
});
