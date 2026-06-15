import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface QueuedOutputSkeletonProps {
  className?: string;
}

/** Placeholder shown while a cell is waiting in Orion's execution queue. */
export function QueuedOutputSkeleton({
  className,
}: QueuedOutputSkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn("border-t border-muted px-3 py-3", className)}
      aria-label="Cell output queued"
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}
