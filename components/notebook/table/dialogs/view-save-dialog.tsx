"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ViewSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newViewName: string;
  setNewViewName: (name: string) => void;
  saveCurrentView: () => void;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
}

/** Dialog for naming and saving a new table view */
export function ViewSaveDialog({
  open,
  onOpenChange,
  newViewName,
  setNewViewName,
  saveCurrentView,
  handleInputFocus,
  handleInputBlur,
}: ViewSaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Current View</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="view-name">View Name</Label>
          <Input
            id="view-name"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            placeholder="Enter a name for this view"
            className="mt-2"
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                saveCurrentView();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={saveCurrentView}>Save View</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
