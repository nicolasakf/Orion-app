"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Dialog showing all available keyboard shortcuts */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-2">
              Navigation & Selection
            </h3>
            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
              <div className="font-mono bg-muted px-2 py-1 rounded">Tab</div>
              <div>Transpose selected row</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Ctrl/Cmd + A
              </div>
              <div>Select all cells</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">Esc</div>
              <div>Exit fullscreen or reset selection</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">H</div>
              <div>Show this shortcuts dialog</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Arrow Keys
              </div>
              <div>Move selected cell</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Shift + Space
              </div>
              <div>Select entire row</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Ctrl + Space
              </div>
              <div>Select entire column</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Shift + Arrows
              </div>
              <div>Extend selection in direction</div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Data Operations</h3>
            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
              <div className="font-mono bg-muted px-2 py-1 rounded">F</div>
              <div>Filter selected column</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">S</div>
              <div>Sort selected column</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">G</div>
              <div>Group by selected column</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">U</div>
              <div>Show unique values in selected column</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">Space</div>
              <div>Filter by selected values</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">&gt;</div>
              <div>Filter for greater than or equal to selected cell</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">&lt;</div>
              <div>Filter for less than or equal to selected cell</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Alt+&gt;
              </div>
              <div>Filter for greater than selected cell</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Alt+&lt;
              </div>
              <div>Filter for less than selected cell</div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">View & Export</h3>
            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Shift + F
              </div>
              <div>Enter fullscreen mode</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">C</div>
              <div>Copy entire dataframe</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">
                Cmd + C
              </div>
              <div>Copy selected cells</div>
              <div className="font-mono bg-muted px-2 py-1 rounded">X</div>
              <div>Export to Excel</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
