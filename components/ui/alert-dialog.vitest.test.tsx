import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

afterEach(() => {
  cleanup();
});

function TestAlertDialog({
  confirmDisabled = false,
  onCancel = vi.fn(),
  onConfirm = vi.fn(),
  onDiscard = vi.fn(),
}: {
  confirmDisabled?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm action</AlertDialogTitle>
          <AlertDialogDescription>
            Choose how to handle this action.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} shortcut="Escape">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard} shortcut="Backspace">
            Discard
          </AlertDialogAction>
          <AlertDialogAction
            disabled={confirmDisabled}
            onClick={onConfirm}
            shortcut="Enter"
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog option shortcuts", () => {
  it("renders a compact shortcut badge on dialog options", () => {
    render(<TestAlertDialog />);

    expect(screen.getByText("Enter")).toBeInTheDocument();
    expect(screen.getByText("Backspace")).toBeInTheDocument();
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("activates matching dialog options from keyboard shortcuts", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const onDiscard = vi.fn();

    render(
      <TestAlertDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Backspace" });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("stops handled dialog shortcut events from leaking", () => {
    const onConfirm = vi.fn();
    const leakedKeyDown = vi.fn();

    render(<TestAlertDialog onConfirm={onConfirm} />);
    document.addEventListener("keydown", leakedKeyDown);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(leakedKeyDown).not.toHaveBeenCalled();

    document.removeEventListener("keydown", leakedKeyDown);
  });

  it("does not activate disabled dialog options from shortcuts", () => {
    const onConfirm = vi.fn();
    const leakedKeyDown = vi.fn();

    render(<TestAlertDialog confirmDisabled onConfirm={onConfirm} />);
    document.addEventListener("keydown", leakedKeyDown);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(leakedKeyDown).not.toHaveBeenCalled();

    document.removeEventListener("keydown", leakedKeyDown);
  });
});
