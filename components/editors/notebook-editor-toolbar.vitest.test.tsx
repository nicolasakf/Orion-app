import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NotebookEditorToolbar,
} from "@/components/editors/notebook-editor-toolbar";

vi.mock("@/components/notebook/notebook-view-toggle", () => ({
  NotebookViewToggle: () => null,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NotebookEditorToolbar restart and run all", () => {
  it.each([
    { restartSucceeded: true, expectedRunCount: 1 },
    { restartSucceeded: false, expectedRunCount: 0 },
  ])(
    "runs cells only when restart success is $restartSucceeded",
    async ({ restartSucceeded, expectedRunCount }) => {
      const onRestartKernel = vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValue(restartSucceeded);
      const onRunAll = vi.fn();

      render(
        <NotebookEditorToolbar
          currentKernel={{
            name: "python3",
            displayName: "Python 3",
            language: "python",
          }}
          kernelStatus="connected"
          isRunning={false}
          presentationHideAllCellInputs={false}
          onRunAll={onRunAll}
          onStopKernel={vi.fn()}
          onRestartKernel={onRestartKernel}
          onTogglePresentationHideAllCellInputs={vi.fn()}
        />,
      );

      const runAllButtons = within(
        screen.getByRole("group", { name: "Run all cells" }),
      ).getAllByRole("button");
      fireEvent.pointerDown(runAllButtons[1], {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(
        await screen.findByRole("menuitem", {
          name: "Restart Kernel and Run All Cells",
        }),
      );

      await waitFor(() => expect(onRestartKernel).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(onRunAll).toHaveBeenCalledTimes(expectedRunCount),
      );
      if (restartSucceeded) {
        expect(onRunAll).toHaveBeenCalledWith(true, "run-all");
      }
    },
  );
});
