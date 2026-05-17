import {
  ensureAppViewLayout,
  getAppViewCells,
  getNotebookAppViewMetadata,
  getOutputAppItemId,
  isCellInAppView,
  isOutputInAppView,
  mergeReactGridLayout,
  withCellAppEnabled,
  withOutputAppEnabled,
} from "@/lib/notebook/app-view";
import { CellType, OutputType, type NotebookCellType } from "@/lib/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function makeCell(id: string, cellType = CellType.CODE): NotebookCellType {
  return {
    cell_type: cellType,
    source: ["print('hello')"],
    metadata: {
      existing: true,
      orion: {
        id,
        cellState: { isInputCollapsed: true },
      },
    },
    outputs: cellType === CellType.CODE ? [] : undefined,
  };
}

runTest("toggling app inclusion preserves existing metadata", () => {
  const cell = makeCell("cell-a");
  const enabled = withCellAppEnabled(cell, true);

  assert(isCellInAppView(enabled), "cell should be app-enabled");
  assert(
    enabled.metadata?.existing === true,
    "top-level metadata should be preserved",
  );
  assert(
    enabled.metadata?.orion?.cellState?.isInputCollapsed === true,
    "orion metadata should be preserved",
  );
  assert(
    enabled.metadata?.orion?.id === "cell-a",
    "cell id should be preserved",
  );
});

runTest("missing cell ids are ignored safely", () => {
  const cell = withCellAppEnabled(
    {
      cell_type: CellType.CODE,
      source: ["1"],
      metadata: { orion: {} },
      outputs: [],
    },
    true,
  );
  const appView = ensureAppViewLayout([cell], getNotebookAppViewMetadata({}));

  assert(
    Object.keys(appView.layout).length === 0,
    "cell without id should not get layout",
  );
});

runTest("app view grid config is read from notebook metadata", () => {
  const appView = getNotebookAppViewMetadata({
    orion: {
      appView: {
        grid: {
          cols: 8,
          rowHeight: 32,
          margin: [4, 8],
          containerPadding: [12, 16],
        },
        layout: {
          wide: { x: 10, y: 0, w: 12, h: 2 },
        },
      },
    },
  });

  assert(appView.grid.cols === 8, "custom column count should be preserved");
  assert(appView.grid.rowHeight === 32, "custom row height should be preserved");
  assert(appView.grid.margin[0] === 4, "custom horizontal margin should persist");
  assert(
    appView.grid.containerPadding[1] === 16,
    "custom vertical container padding should persist",
  );
  assert(
    appView.layout.wide.w === 8,
    "layout item width should clamp to custom column count",
  );
  assert(
    appView.layout.wide.x === 0,
    "layout item x should clamp into custom column count",
  );
});

runTest(
  "new marked cells receive deterministic default layout positions",
  () => {
    const cells = [
      withCellAppEnabled(makeCell("cell-a", CellType.MARKDOWN), true),
      withCellAppEnabled(makeCell("cell-b", CellType.MARKDOWN), true),
      withCellAppEnabled(makeCell("cell-c", CellType.MARKDOWN), true),
    ];
    const appView = ensureAppViewLayout(cells, getNotebookAppViewMetadata({}));

    assert(appView.layout["cell-a"].x === 0, "first item x should be 0");
    assert(appView.layout["cell-a"].y === 0, "first item y should be 0");
    assert(
      appView.layout["cell-b"].x === 6,
      "second item should fill same row",
    );
    assert(appView.layout["cell-b"].y === 0, "second item y should be 0");
    assert(appView.layout["cell-c"].x === 0, "third item should wrap to x 0");
    assert(
      appView.layout["cell-c"].y === 4,
      "third item should start below tallest row item",
    );
  },
);

runTest("specific code outputs receive their own app item and layout", () => {
  const codeCell = makeCell("cell-a");
  const withOutputs = {
    ...codeCell,
    outputs: [
      {
        output_type: OutputType.DISPLAY_DATA,
        data: { "text/plain": ["first"] },
      },
      {
        output_type: OutputType.DISPLAY_DATA,
        data: { "text/plain": ["second"] },
      },
    ],
  };
  const enabled = withOutputAppEnabled(withOutputs, 1, true);
  const outputItemId = getOutputAppItemId("cell-a", 1);
  const appCells = getAppViewCells([enabled]);
  const appView = ensureAppViewLayout(
    [enabled],
    getNotebookAppViewMetadata({}),
  );

  assert(isOutputInAppView(enabled, 1), "second output should be app-enabled");
  assert(appCells.length === 1, "only the selected output should render");
  assert(
    appCells[0].appItemId === outputItemId,
    "output item should use output layout key",
  );
  assert(
    appCells[0].outputIndex === 1,
    "output item should preserve output index",
  );
  assert(
    appView.layout[outputItemId].h === 8,
    "output layout should use output card height",
  );
});

runTest("manual layout merge preserves stale entries", () => {
  const merged = mergeReactGridLayout(
    {
      stale: { x: 1, y: 1, w: 2, h: 2 },
      active: { x: 0, y: 0, w: 6, h: 5 },
    },
    [{ i: "active", x: 6, y: 2, w: 4, h: 3 }],
  );

  assert(merged.active.x === 6, "active item should update");
  assert(merged.stale.x === 1, "stale item should be preserved");
});
