export enum CellType {
  CODE = "code",
  MARKDOWN = "markdown",
  RAW = "raw",
}

export enum OutputType {
  EXECUTE_RESULT = "execute_result",
  DISPLAY_DATA = "display_data",
  STREAM = "stream",
  ERROR = "error",
}

export enum CellExecutionStatus {
  IDLE = "idle",
  RUNNING = "running",
  SUCCESS = "success",
  ERROR = "error",
}

export interface ExecutionStatistics {
  wallTime: number; // Total wall clock time in milliseconds
  cpuTime?: number; // CPU time in milliseconds
  memoryUsage?: number; // Memory usage in bytes
  peakMemory?: number; // Peak memory usage in bytes
  ioRead?: number; // IO read in bytes
  ioWrite?: number; // IO write in bytes
}

export interface CellExecutionInfo {
  status: CellExecutionStatus;
  startTime?: Date | string;
  endTime?: Date | string;
  duration?: number; // Duration in milliseconds
  statistics?: ExecutionStatistics;
  lastExecuted?: Date | string;
}

export interface NotebookCellType {
  cell_type: CellType;
  source: string[];
  metadata?: Record<string, any>;
  execution_count?: number | null;
  outputs?: NotebookOutputType[];
}

export interface NotebookOutputType {
  output_type: OutputType;
  execution_count?: number;
  data?: {
    "text/plain"?: string[];
    "text/html"?: string[];
    "image/png"?: string;
    [key: string]: any;
  };
  metadata?: Record<string, any>;

  // For stream output
  name?: string;
  text?: string[];

  // For error output
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

export interface NotebookType {
  cells: NotebookCellType[];
  metadata: {
    kernelspec?: {
      display_name?: string;
      language?: string;
      name?: string;
    };
    language_info?: {
      name?: string;
      version?: string;
    };
    title?: string;
    [key: string]: any;
  };
  nbformat: number;
  nbformat_minor: number;
}

// Kernel related types (moved from notebook-toolbar.tsx)
export type KernelStatus = "connected" | "connecting" | "disconnected" | "busy";

export interface KernelInfo {
  name: string;
  displayName: string;
  language: string;
  path?: string;
}
